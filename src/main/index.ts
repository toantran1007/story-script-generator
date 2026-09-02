import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { readFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { buildChatCompletionBody } from './modelResolver'

interface ProjectRecord {
  id: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  idea: string
  storyNotes?: string
  autoFlow?: boolean
  style: string
  customStyle: string
  language: string
  customLanguage: string
  duration: number
  enableHook?: boolean
  readingSpeed?: number
  mode: string
  currentStep: number
  questions: string[]
  answers: Record<number, string>
  outlinePhase: string
  outline: unknown
  viSummary: string
  userDirection: string
  generatedStory: string
  outlineSummary: string
  writingMemory: unknown
}

const MAX_IMPORTED_TEXT_BYTES = 5 * 1024 * 1024
// Keep imported prompts within a practical model context size.
const MAX_IMPORTED_TEXT_CHARS = 120_000

type ApiProviderId = 'legacy' | 'vilao' | 'custom'

interface ApiProviderProfile {
  apiBaseUrl: string
  apiKey: string
  model: string
}

interface SettingsRecord extends ApiProviderProfile {
  apiProvider?: ApiProviderId
  apiProfiles?: Record<ApiProviderId, ApiProviderProfile>
  maxTokens: number
  temperature: number
}

const store = new Store<{
  projects: ProjectRecord[]
  settings: SettingsRecord
  customStyles: string[]
  customLanguages: string[]
}>({
  defaults: {
    projects: [],
    settings: {
      apiProvider: 'legacy',
      apiProfiles: {
        legacy: {
          apiBaseUrl: 'http://localhost:20128/v1',
          apiKey: '',
          model: ''
        },
        vilao: {
          apiBaseUrl: 'https://api.vilao.ai/v1',
          apiKey: '',
          model: 'cd/gpt-5.6-sol'
        },
        custom: { apiBaseUrl: '', apiKey: '', model: '' }
      },
      apiBaseUrl: 'http://localhost:20128/v1',
      apiKey: '',
      model: '',
      maxTokens: 16384,
      temperature: 0.8
    },
    customStyles: [],
    customLanguages: []
  }
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Window controls IPC
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow.close())
}

// --- IPC Handlers ---

// Request đang chạy, khoá theo requestId do renderer sinh ra — dùng để huỷ giữa chừng.
const activeRequests = new Map<string, AbortController>()

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

interface UpdateState {
  status: UpdateStatus
  version?: string
  progress?: number
  message?: string
}

let updateState: UpdateState = { status: 'idle' }
let updateCheckPromise: Promise<UpdateState> | null = null

function buildApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function getUpdateUnsupportedState(): UpdateState | null {
  if (!app.isPackaged) {
    return { status: 'unsupported', message: 'Bản phát triển không hỗ trợ tự cập nhật' }
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return {
      status: 'unsupported',
      message: 'Bản portable cần tải và cập nhật thủ công'
    }
  }
  return null
}

function publishUpdateState(next: UpdateState): UpdateState {
  updateState = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('update:status', next)
    }
  }
  return next
}

function updateErrorMessage(error: unknown): string {
  const raw = String(error)
  if (raw.includes('404')) {
    return 'Không thể truy cập máy chủ cập nhật. Kho GitHub Release có thể đang ở chế độ riêng tư.'
  }
  return raw.replace(/^Error:\s*/, '')
}

async function checkForAppUpdate(): Promise<UpdateState> {
  const unsupported = getUpdateUnsupportedState()
  if (unsupported) return publishUpdateState(unsupported)

  if (['checking', 'available', 'downloading', 'downloaded'].includes(updateState.status)) {
    return updateState
  }
  if (updateCheckPromise) return updateCheckPromise

  publishUpdateState({ status: 'checking', message: 'Đang kiểm tra phiên bản mới...' })
  updateCheckPromise = autoUpdater
    .checkForUpdates()
    .then(() => updateState)
    .catch((error) =>
      publishUpdateState({ status: 'error', message: updateErrorMessage(error) })
    )
    .finally(() => {
      updateCheckPromise = null
    })

  return updateCheckPromise
}

// Huỷ một request đang chạy. Trả về true nếu tìm thấy và đã huỷ.
ipcMain.handle('api:abort', (_event, requestId: string) => {
  const controller = activeRequests.get(requestId)
  if (!controller) return false
  controller.abort()
  activeRequests.delete(requestId)
  return true
})

// API proxy to avoid CORS
ipcMain.handle('api:chat', async (_event, messages, options, requestId?: string) => {
  const settings = store.get('settings')
  const url = buildApiUrl(settings.apiBaseUrl, 'chat/completions')

  const body = buildChatCompletionBody(settings, messages, options)

  const controller = new AbortController()
  if (requestId) activeRequests.set(requestId, controller)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? ''
  } finally {
    if (requestId) activeRequests.delete(requestId)
  }
})

// Streaming API proxy — mỗi lần gọi có streamId riêng để chunk không lẫn giữa các tab
ipcMain.handle('api:chat-stream', async (event, messages, options, streamId?: string) => {
  const settings = store.get('settings')
  const url = buildApiUrl(settings.apiBaseUrl, 'chat/completions')

  const body = buildChatCompletionBody(settings, messages, options, true)

  const controller = new AbortController()
  if (streamId) activeRequests.set(streamId, controller)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No readable stream')

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            if (!event.sender.isDestroyed()) {
              event.sender.send('api:stream-chunk', { streamId: streamId ?? '', content })
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    return fullText
  } finally {
    if (streamId) activeRequests.delete(streamId)
  }
})

// --- Project CRUD ---
ipcMain.handle('store:get-projects', () => store.get('projects', []))

ipcMain.handle('store:save-project', (_event, project: ProjectRecord) => {
  const projects = store.get('projects', [])
  const idx = projects.findIndex((p) => p.id === project.id)
  if (idx >= 0) {
    projects[idx] = project
  } else {
    projects.unshift(project)
  }
  store.set('projects', projects)
  return projects
})

ipcMain.handle('file:read-txt', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text files', extensions: ['txt'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null

  const filePath = result.filePaths[0]
  if (!filePath.toLowerCase().endsWith('.txt')) {
    throw new Error('Định dạng không hỗ trợ. Vui lòng chọn file .txt.')
  }
  const file = await readFile(filePath)
  if (file.length > MAX_IMPORTED_TEXT_BYTES) {
    throw new Error('File quá lớn. Vui lòng chọn file TXT nhỏ hơn 5 MB.')
  }

  let content: string
  if (file[0] === 0xff && file[1] === 0xfe) {
    content = file.subarray(2).toString('utf16le')
  } else if (file[0] === 0xfe && file[1] === 0xff) {
    const swapped = Buffer.from(file.subarray(2))
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const byte = swapped[i]
      swapped[i] = swapped[i + 1]
      swapped[i + 1] = byte
    }
    content = swapped.toString('utf16le')
  } else {
    content = file.toString('utf8').replace(/^\uFEFF/, '')
  }
  if (!content.trim()) throw new Error('File TXT không có nội dung.')
  if (content.length > MAX_IMPORTED_TEXT_CHARS) {
    throw new Error(`Nội dung file quá dài (${content.length.toLocaleString()} ký tự). Vui lòng dùng file không quá ${MAX_IMPORTED_TEXT_CHARS.toLocaleString()} ký tự.`)
  }

  return { name: filePath.split(/[\\/]/).pop() || 'script.txt', content, bytes: file.length }
})

ipcMain.handle('store:delete-project', (_event, id: string) => {
  const projects = store.get('projects', []).filter((p) => p.id !== id)
  store.set('projects', projects)
  return projects
})

// Settings
ipcMain.handle('store:get-settings', () => store.get('settings'))
ipcMain.handle('store:save-settings', (_event, settings: SettingsRecord) => {
  store.set('settings', settings)
  return settings
})

// Custom presets
ipcMain.handle('store:get-custom-presets', () => ({
  styles: store.get('customStyles', []),
  languages: store.get('customLanguages', [])
}))

ipcMain.handle('store:save-custom-style', (_event, style: string) => {
  const styles = store.get('customStyles', [])
  if (!styles.includes(style)) {
    styles.push(style)
    store.set('customStyles', styles)
  }
  return styles
})

ipcMain.handle('store:delete-custom-style', (_event, style: string) => {
  const styles = store.get('customStyles', []).filter((s) => s !== style)
  store.set('customStyles', styles)
  return styles
})

ipcMain.handle('store:save-custom-language', (_event, lang: string) => {
  const languages = store.get('customLanguages', [])
  if (!languages.includes(lang)) {
    languages.push(lang)
    store.set('customLanguages', languages)
  }
  return languages
})

ipcMain.handle('store:delete-custom-language', (_event, lang: string) => {
  const languages = store.get('customLanguages', []).filter((l) => l !== lang)
  store.set('customLanguages', languages)
  return languages
})

// Export project story
ipcMain.handle('store:export-story', async (_event, project: ProjectRecord, format: string) => {
  const ext = format === 'md' ? 'md' : 'txt'
  const title = project.name || 'story'
  const result = await dialog.showSaveDialog({
    defaultPath: `${title}.${ext}`,
    filters: [{ name: format === 'md' ? 'Markdown' : 'Text', extensions: [ext] }]
  })

  if (result.canceled || !result.filePath) return false

  let content = project.generatedStory
  if (format === 'md') {
    content = `# ${title}\n\n> Style: ${project.style} | Language: ${project.language} | Duration: ${project.duration} min\n\n---\n\n${project.generatedStory}`
  }

  writeFileSync(result.filePath, content, 'utf-8')
  return true
})

// Test API connection
ipcMain.handle('api:test-connection', async (_event, override?: Partial<SettingsRecord>) => {
  const settings = { ...store.get('settings'), ...override }
  const url = buildApiUrl(settings.apiBaseUrl, 'models')

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`
    }
  })

  if (!response.ok) throw new Error(`Connection failed: ${response.status}`)
  const data = await response.json()
  return data
})

ipcMain.handle('app:get-info', () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
  isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
  updateSupported: getUpdateUnsupportedState() === null
}))

ipcMain.handle('update:get-state', () => updateState)
ipcMain.handle('update:check', () => checkForAppUpdate())
ipcMain.on('update:install', () => {
  if (updateState.status === 'downloaded') autoUpdater.quitAndInstall()
})

// --- Auto update từ GitHub Releases ---
// Chỉ chạy ở bản đã cài bằng setup.exe; bản portable và bản dev không tự cập nhật.
function setupAutoUpdate(): void {
  const unsupported = getUpdateUnsupportedState()
  if (unsupported) {
    updateState = unsupported
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    publishUpdateState({ status: 'checking', message: 'Đang kiểm tra phiên bản mới...' })
  })

  autoUpdater.on('update-available', (info) => {
    publishUpdateState({
      status: 'available',
      version: info.version,
      message: `Đã tìm thấy phiên bản ${info.version}`
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    publishUpdateState({
      status: 'downloading',
      version: updateState.version,
      progress: progress.percent,
      message: `Đang tải bản cập nhật ${Math.round(progress.percent)}%`
    })
  })

  autoUpdater.on('update-not-available', () => {
    publishUpdateState({ status: 'up-to-date', message: 'Đang sử dụng phiên bản mới nhất' })
  })

  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateState({
      status: 'downloaded',
      version: info.version,
      progress: 100,
      message: `Phiên bản ${info.version} đã tải xong`
    })
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Cập nhật mới',
        message: `Phiên bản ${info.version} đã tải xong.\nKhởi động lại để cập nhật ngay?`,
        buttons: ['Cập nhật ngay', 'Để sau (tự cập nhật khi tắt app)'],
        defaultId: 0,
        cancelId: 1
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (error) => {
    publishUpdateState({ status: 'error', message: updateErrorMessage(error) })
  })

  void checkForAppUpdate()
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kichban.story-generator')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
