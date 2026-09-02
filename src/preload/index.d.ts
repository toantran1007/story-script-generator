import { ElectronAPI } from '@electron-toolkit/preload'

interface Api {
  chat: (messages: unknown[], options?: unknown, requestId?: string) => Promise<string>
  chatStream: (messages: unknown[], options?: unknown, streamId?: string) => Promise<string>
  onStreamChunk: (streamId: string, callback: (chunk: string) => void) => () => void
  abortRequest: (requestId: string) => Promise<boolean>
  testConnection: (settings?: unknown) => Promise<unknown>
  readTxtFile: () => Promise<{ name: string; content: string; bytes: number } | null>

  getProjects: () => Promise<unknown[]>
  saveProject: (project: unknown) => Promise<unknown[]>
  deleteProject: (id: string) => Promise<unknown[]>
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
