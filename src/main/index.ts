import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname, relative, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { readFile } from 'fs/promises'
import { writeFileSync, existsSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { formatStoryWithHook } from '../shared/storyFormatting'
import { ProjectFileStore } from './projectFiles'
import { readChatResponse } from './chatResponse'
import { providerRequest, usesResponses, responseText, readResponsesStream } from './responsesProvider'

interface ProjectRecord {
  id: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  idea: string
  ideaInputType?: 'idea' | 'outline'
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
  hookText?: string
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
  workspaceSession: unknown
  projectDataRoot?: string
}>({
  defaults: {
    projects: [],
    settings: {
      apiProvider: 'legacy',
      apiProfiles: {
        legacy: {
          apiBaseUrl: 'http://localhost:64072/v1',
          apiKey: '',
          model: 'gpt-6-astra'
        },
        vilao: {
          apiBaseUrl: 'https://api.vilao.ai/v1',
          apiKey: '',
          model: 'cd/gpt-5.6-sol'
        },
        custom: { apiBaseUrl: '', apiKey: '', model: '' }
      },
      apiBaseUrl: 'http://localhost:64072/v1',
      apiKey: '',
      model: 'gpt-6-astra',
      maxTokens: 16384,
      temperature: 0.8
    },
    customStyles: [],
    customLanguages: [],
    workspaceSession: null
  }
})

let projectFiles: ProjectFileStore<ProjectRecord> | null = null
function files(): ProjectFileStore<ProjectRecord> {
  if (!projectFiles) throw new Error('Thư mục dữ liệu chưa sẵn sàng')
  return projectFiles
}

async function initializeProjectFiles(): Promise<void> {
  const savedRoot = store.get('projectDataRoot')
  let root = savedRoot || join(app.isPackaged ? process.env.PORTABLE_EXECUTABLE_DIR || dirname(process.execPath) : app.getAppPath(), 'data')
  try {
    assertDataRootLocation(root)
    if (savedRoot && !existsSync(savedRoot)) throw new Error('Thư mục dữ liệu đã chọn không còn truy cập được')
    projectFiles = new ProjectFileStore<ProjectRecord>(root)
  } catch (error) {
    await dialog.showMessageBox({ type: 'warning', message: 'Không truy cập được thư mục dữ liệu dự án.',
      detail: `${root}\n${error instanceof Error ? error.message : String(error)}\nHãy chọn lại thư mục dữ liệu cũ, hoặc thư mục có quyền ghi nếu đây là lần thiết lập đầu. Dữ liệu cũ chưa bị xoá.` })
    const choice = await dialog.showOpenDialog({ title: 'Chọn thư mục dữ liệu của tool', properties: ['openDirectory', 'createDirectory'] })
    if (choice.canceled || !choice.filePaths[0]) throw new Error('Chưa chọn thư mục dữ liệu; dữ liệu cũ được giữ nguyên')
    root = choice.filePaths[0]
    assertDataRootLocation(root)
    if (savedRoot && !existsSync(join(root, 'data-root.json'))) throw new Error('Hãy chọn đúng thư mục dữ liệu cũ có data-root.json để tránh mở nhầm một kho trống.')
    projectFiles = new ProjectFileStore<ProjectRecord>(root)
  }
  const legacy = store.get('projects', [])
  projectFiles.migrate(legacy)
  store.set('projectDataRoot', projectFiles.root)
  if (legacy.length) store.set('projects', [])
}

function assertDataRootLocation(root: string): void {
  if (app.isPackaged) return
  const first = relative(app.getAppPath(), resolve(root)).split(/[\\/]/)[0].toLowerCase()
  if (['out', 'dist', 'node_modules', '.git', '.agents'].includes(first)) throw new Error('Không đặt dữ liệu trong thư mục build/dependency; hãy chọn thư mục data hoặc thư mục riêng.')
}

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
  const { endpoint, body } = providerRequest(settings, messages, options)
  const url = buildApiUrl(settings.apiBaseUrl, endpoint)

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
    return usesResponses(settings) ? responseText(data) : readChatResponse(data)
  } finally {
    if (requestId) activeRequests.delete(requestId)
  }
})

// Streaming API proxy — mỗi lần gọi có streamId riêng để chunk không lẫn giữa các tab
ipcMain.handle('api:chat-stream', async (event, messages, options, streamId?: string, detailed = false) => {
  const settings = store.get('settings')
  const { endpoint, body } = providerRequest(settings, messages, options, true)
  const url = buildApiUrl(settings.apiBaseUrl, endpoint)

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
    if (usesResponses(settings)) {
      const result = await readResponsesStream(reader, (content) => {
        if (!event.sender.isDestroyed()) event.sender.send('api:stream-chunk', { streamId: streamId ?? '', content })
      })
      return detailed ? result : result.text
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''
    let finishReason: string | null = null

    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason
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
      if (done) break
    }

    return detailed ? { text: fullText, finishReason } : fullText
  } finally {
    if (streamId) activeRequests.delete(streamId)
  }
})

// --- Project CRUD ---
ipcMain.handle('store:get-projects', () => files().list())

ipcMain.handle('store:save-project', (_event, project: ProjectRecord) => {
  files().save(project)
  return []
})

ipcMain.handle('store:get-workspace', () => store.get('workspaceSession', null))
ipcMain.handle('store:save-workspace', (_event, workspace: unknown) => {
  store.set('workspaceSession', workspace)
})

// Only the final unload checkpoint is synchronous, so the renderer waits for disk acknowledgement.
ipcMain.on('store:flush-projects', (event, incoming: ProjectRecord[], workspace?: unknown) => {
  try {
    if (!Array.isArray(incoming)) throw new Error('Invalid project checkpoint')
    for (const project of incoming) files().save(project)
    if (workspace !== undefined) store.set('workspaceSession', workspace)
    event.returnValue = { success: true }
  } catch (error) {
    event.returnValue = { success: false, error: error instanceof Error ? error.message : String(error) }
  }
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

ipcMain.handle('store:confirm-delete-project', async (_event, id: string) => {
  const project = files().list().find((p) => p.id === id)
  if (!project) return true // A committed deletion may need retrying after a filesystem error.
  const answer = await dialog.showMessageBox({ type: 'warning', buttons: ['Xoá dự án', 'Hủy'], defaultId: 1, cancelId: 1,
    message: `Xoá vĩnh viễn dự án “${project.name}”?`, detail: 'Tác vụ đang chạy sẽ dừng. Truyện, memory và bản sao lưu nội bộ của dự án sẽ bị xoá khỏi máy, không thể khôi phục. File đã xuất ra nơi khác không bị xoá.' })
  return answer.response === 0
})
ipcMain.handle('store:delete-project', (_event, id: string) => { files().remove(id); return [] })
ipcMain.handle('store:get-deleted-projects', () => files().listDeleted())
ipcMain.handle('store:restore-project', (_event, id: string) => files().restore(id))
ipcMain.handle('store:get-data-root', () => files().root)
ipcMain.handle('store:open-data-root', () => shell.openPath(files().root))

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

  let content = formatStoryWithHook(project.generatedStory, project.hookText, project.language)
  if (format === 'md') {
    content = `# ${title}\n\n> Style: ${project.style} | Language: ${project.language} | Duration: ${project.duration} min\n\n---\n\n${content}`
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
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
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
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (window) { if (window.isMinimized()) window.restore(); window.focus() }
})
app.whenReady().then(async () => {
  if (!primaryInstance) return
  try { await initializeProjectFiles() } catch (error) {
    dialog.showErrorBox('Không mở được dữ liệu dự án', error instanceof Error ? error.message : String(error))
    app.quit(); return
  }
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
