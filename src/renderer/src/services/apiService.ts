import { v4 as uuidv4 } from 'uuid'
import type { AppSettings, ChatMessage, ChatOptions } from '@/types'

// ===== Cancellation =====
// "owner" là id dự án (pid). Mọi request của một dự án được gom theo owner
// để nút Dừng có thể huỷ toàn bộ request đang bay của riêng dự án đó.
const activeByOwner = new Map<string, Set<string>>()
const cancelledOwners = new Set<string>()

export class CancelledError extends Error {
  constructor(message = 'Đã dừng theo yêu cầu') {
    super(message)
    this.name = 'CancelledError'
  }
}

export function isCancelled(owner: string): boolean {
  return cancelledOwners.has(owner)
}

/** Đánh dấu owner bị huỷ và abort mọi request đang chạy của owner đó. */
export function abortOwner(owner: string): void {
  cancelledOwners.add(owner)
  const ids = activeByOwner.get(owner)
  if (!ids) return
  for (const id of ids) {
    void window.api.abortRequest(id)
  }
  ids.clear()
}

/** Xoá cờ huỷ — gọi trước khi bắt đầu một tác vụ mới cho owner. */
export function clearCancel(owner: string): void {
  cancelledOwners.delete(owner)
}

function trackRequest(owner: string | undefined, requestId: string): void {
  if (!owner) return
  let ids = activeByOwner.get(owner)
  if (!ids) {
    ids = new Set()
    activeByOwner.set(owner, ids)
  }
  ids.add(requestId)
}

function untrackRequest(owner: string | undefined, requestId: string): void {
  if (!owner) return
  activeByOwner.get(owner)?.delete(requestId)
}

// ===== Error cleanup =====
function cleanApiError(err: unknown): string {
  const raw = String(err)
  // Cloudflare 524 timeout
  if (raw.includes('524') && raw.includes('timeout')) {
    return 'API timeout (524) — Server phản hồi quá chậm. Thử lại sau.'
  }
  // Cloudflare 502/503
  if (raw.includes('502') || raw.includes('503')) {
    return 'API không khả dụng (502/503) — Server đang quá tải. Thử lại sau.'
  }
  // Strip HTML from error messages
  if (raw.includes('<!DOCTYPE') || raw.includes('<html')) {
    const statusMatch = raw.match(/API Error (\d+)/)
    const code = statusMatch ? statusMatch[1] : 'unknown'
    return `API Error ${code} — Server trả về lỗi HTML. Có thể do timeout hoặc server quá tải.`
  }
  // Rate limit
  if (raw.includes('429')) {
    return 'API rate limit (429) — Quá nhiều request. Đợi 30s rồi thử lại.'
  }
  return raw
}

// ===== Retry logic =====
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 3000

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(err: unknown): boolean {
  const errStr = String(err)
  return (
    errStr.includes('524') ||
    errStr.includes('502') ||
    errStr.includes('503') ||
    errStr.includes('timeout') ||
    errStr.includes('ECONNRESET') ||
    errStr.includes('fetch failed')
  )
}

export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions,
  owner?: string
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (owner && isCancelled(owner)) throw new CancelledError()

    const requestId = uuidv4()
    trackRequest(owner, requestId)
    try {
      return await window.api.chat(messages, options, requestId)
    } catch (err) {
      // Người dùng bấm Dừng — không retry, không coi là lỗi API
      if (owner && isCancelled(owner)) throw new CancelledError()
      lastError = err
      // Only retry on timeout/server errors, not on 4xx client errors
      if (!isRetryableError(err) || attempt === MAX_RETRIES) break
      console.warn(
        `[API] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`,
        String(err).slice(0, 200)
      )
      await sleep(RETRY_DELAY_MS * (attempt + 1)) // Exponential backoff
    } finally {
      untrackRequest(owner, requestId)
    }
  }
  throw new Error(cleanApiError(lastError))
}

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options?: ChatOptions,
  owner?: string
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (owner && isCancelled(owner)) throw new CancelledError()

    const streamId = uuidv4()
    trackRequest(owner, streamId)
    const cleanup = window.api.onStreamChunk(streamId, onChunk)
    try {
      return await window.api.chatStream(messages, options, streamId)
    } catch (err) {
      if (owner && isCancelled(owner)) throw new CancelledError()
      lastError = err
      if (!isRetryableError(err) || attempt === MAX_RETRIES) break
      console.warn(`[API Stream] Attempt ${attempt + 1} failed, retrying...`)
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    } finally {
      cleanup()
      untrackRequest(owner, streamId)
    }
  }
  throw new Error(cleanApiError(lastError))
}

export async function testConnection(
  settings?: AppSettings
): Promise<{ success: boolean; models?: string[]; error?: string }> {
  try {
    const data = await window.api.testConnection(settings) as { data?: { id: string }[] }
    const models = data?.data?.map((m) => m.id) || []
    return { success: true, models }
  } catch (err) {
    return { success: false, error: cleanApiError(err) }
  }
}
