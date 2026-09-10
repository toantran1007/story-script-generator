import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // API calls (proxied through main process)
  chat: (messages: unknown[], options?: unknown, requestId?: string): Promise<string> =>
    ipcRenderer.invoke('api:chat', messages, options, requestId),

  chatStream: (messages: unknown[], options?: unknown, streamId?: string): Promise<string> =>
    ipcRenderer.invoke('api:chat-stream', messages, options, streamId),
  chatStreamDetailed: (messages: unknown[], options?: unknown, streamId?: string): Promise<{ text: string; finishReason: string | null }> =>
    ipcRenderer.invoke('api:chat-stream', messages, options, streamId, true),

  // Chỉ nhận chunk của đúng streamId đã đăng ký — nhiều tab stream song song không lẫn nhau
  onStreamChunk: (streamId: string, callback: (chunk: string) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { streamId: string; content: string }
    ): void => {
      if (payload?.streamId !== streamId) return
      callback(payload.content)
    }
    ipcRenderer.on('api:stream-chunk', handler)
    return () => ipcRenderer.removeListener('api:stream-chunk', handler)
  },

  abortRequest: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke('api:abort', requestId),

  testConnection: (settings?: unknown): Promise<unknown> =>
    ipcRenderer.invoke('api:test-connection', settings),

  readTxtFile: (): Promise<{ name: string; content: string; bytes: number } | null> =>
    ipcRenderer.invoke('file:read-txt'),

  // Project CRUD
  getProjects: (): Promise<unknown[]> => ipcRenderer.invoke('store:get-projects'),
  saveProject: (project: unknown): Promise<unknown[]> =>
    ipcRenderer.invoke('store:save-project', project),
  getWorkspace: (): Promise<unknown> => ipcRenderer.invoke('store:get-workspace'),
  saveWorkspace: (workspace: unknown): Promise<void> => ipcRenderer.invoke('store:save-workspace', workspace),
  flushProjects: (projects: unknown[], workspace?: unknown): void => {
    const result = ipcRenderer.sendSync('store:flush-projects', projects, workspace)
    if (!result?.success) throw new Error(result?.error || 'Không thể lưu phiên làm việc')
  },
  deleteProject: (id: string): Promise<unknown[]> =>
    ipcRenderer.invoke('store:delete-project', id),
  confirmDeleteProject: (id: string): Promise<boolean> => ipcRenderer.invoke('store:confirm-delete-project', id),
  getDeletedProjects: (): Promise<unknown[]> => ipcRenderer.invoke('store:get-deleted-projects'),
  restoreProject: (id: string): Promise<unknown> => ipcRenderer.invoke('store:restore-project', id),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('store:get-data-root'),
  openDataRoot: (): Promise<string> => ipcRenderer.invoke('store:open-data-root'),
  exportStory: (project: unknown, format: string): Promise<boolean> =>
    ipcRenderer.invoke('store:export-story', project, format),

  // Settings
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('store:get-settings'),
  saveSettings: (settings: unknown): Promise<unknown> =>
    ipcRenderer.invoke('store:save-settings', settings),

  // Custom presets
  getCustomPresets: (): Promise<unknown> => ipcRenderer.invoke('store:get-custom-presets'),
  saveCustomStyle: (style: string): Promise<unknown> =>
    ipcRenderer.invoke('store:save-custom-style', style),
  deleteCustomStyle: (style: string): Promise<unknown> =>
    ipcRenderer.invoke('store:delete-custom-style', style),
  saveCustomLanguage: (lang: string): Promise<unknown> =>
    ipcRenderer.invoke('store:save-custom-language', lang),
  deleteCustomLanguage: (lang: string): Promise<unknown> =>
    ipcRenderer.invoke('store:delete-custom-language', lang),

  // App version and updates
  getAppInfo: (): Promise<unknown> => ipcRenderer.invoke('app:get-info'),
  getUpdateState: (): Promise<unknown> => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('update:check'),
  installUpdate: (): void => ipcRenderer.send('update:install'),
  onUpdateStatus: (callback: (state: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void => callback(state)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },

  // Window controls
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  close: (): void => ipcRenderer.send('window:close')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback for non-isolated context
  window.electron = electronAPI
  // @ts-expect-error fallback
  window.api = api
}
