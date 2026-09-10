import { ElectronAPI } from '@electron-toolkit/preload'

interface Api {
  chat: (messages: unknown[], options?: unknown, requestId?: string) => Promise<string>
  chatStream: (messages: unknown[], options?: unknown, streamId?: string) => Promise<string>
  chatStreamDetailed: (messages: unknown[], options?: unknown, streamId?: string) => Promise<{ text: string; finishReason: string | null }>
  onStreamChunk: (streamId: string, callback: (chunk: string) => void) => () => void
  abortRequest: (requestId: string) => Promise<boolean>
  testConnection: (settings?: unknown) => Promise<unknown>
  readTxtFile: () => Promise<{ name: string; content: string; bytes: number } | null>

  getProjects: () => Promise<unknown[]>
  saveProject: (project: unknown) => Promise<unknown[]>
  getWorkspace: () => Promise<unknown>
  saveWorkspace: (workspace: unknown) => Promise<void>
  flushProjects: (projects: unknown[], workspace?: unknown) => void
  deleteProject: (id: string) => Promise<unknown[]>
  confirmDeleteProject: (id: string) => Promise<boolean>
  getDeletedProjects: () => Promise<unknown[]>
  restoreProject: (id: string) => Promise<unknown>
  getDataRoot: () => Promise<string>
  openDataRoot: () => Promise<string>
  exportStory: (project: unknown, format: string) => Promise<boolean>

  getSettings: () => Promise<unknown>
  saveSettings: (settings: unknown) => Promise<unknown>

  getCustomPresets: () => Promise<unknown>
  saveCustomStyle: (style: string) => Promise<unknown>
  deleteCustomStyle: (style: string) => Promise<unknown>
  saveCustomLanguage: (lang: string) => Promise<unknown>
  deleteCustomLanguage: (lang: string) => Promise<unknown>

  getAppInfo: () => Promise<AppInfo>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  installUpdate: () => void
  onUpdateStatus: (callback: (state: UpdateState) => void) => () => void

  minimize: () => void
  maximize: () => void
  close: () => void
}

interface AppInfo {
  version: string
  isPackaged: boolean
  isPortable: boolean
  updateSupported: boolean
}

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

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
