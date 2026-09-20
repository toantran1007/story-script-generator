import type { ChatMessage, ChatOptions, Outline, Project } from '@/types'

export interface DurationPlan {
  requestedMinutes: number
  estimatedMinutes: number
  targetCharacters: number
  rationale: string
  source: 'ai-estimate'
  actualCharacters?: number
  actualEstimatedMinutes?: number
  actualEstimateSource?: 'author-tts-calibration' | 'ai-estimate' | 'ai-plan-ratio'
  actualCalibrationId?: string
}
export interface ChapterPlan {
  chapter: number
  targetCharacters: number
  estimatedMinutes: number
  beats: string[]
  ending: string
}
export interface StoryPlan {
  version: 1
  inputKey: string
  outline: Outline
  duration: DurationPlan
  chapters: ChapterPlan[]
  canon: string[]
}
export interface HistoryCheckpoint {
  from: number
  to: number
  sourceKey: string
  summary: string
}
export interface LongStoryState {
  version: 1
  plan: StoryPlan
  cursor: number
  stage: 'write' | 'review' | 'accepted' | 'manual' | 'done'
  attempt: number
  recoveryRound?: number
  retryStage?: 'write' | 'review'
  feedback?: string
  error?: string
  draft?: string
  originalDraft?: string
  truncated?: boolean
  continuationBuffer?: { base: string; text: string }
  failureKind?: import('@/services/longStory/recoveryPolicy').FailureKind
  nextRetryAt?: string
  recoveryHistory?: { time: string; chapter: number; stage: string; kind: string; message: string; round: number; attempt: number; delayMs: number; model?: string }[]
  accepted: { chapter: number; revision: string; estimatedMinutes: number }[]
  checkpoints: HistoryCheckpoint[]
}
export interface StoryPorts {
  read(): Project | null
  save(patch: Partial<Project>): Promise<void>
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>
  stream(messages: ChatMessage[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<{ text: string; finishReason: string | null }>
  stopped(): boolean
  progress(message: string, text?: string): void
  wait?(milliseconds: number): Promise<void>
  fallback?(): Promise<string | null>
}

export class StoryPaused extends Error {
  constructor() { super('Đã tạm dừng; bản nháp được giữ lại'); this.name = 'CancelledError' }
}
export class StoryStorageError extends Error {
  constructor() { super('Không lưu được checkpoint sau 3 lần; chưa gọi AI tiếp. Kiểm tra thư mục dữ liệu rồi tiếp tục.'); this.name = 'StoryStorageError' }
}
