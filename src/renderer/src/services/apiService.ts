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

export class ApiRequestError extends Error {
  technicalDetail: string
  attempts: number

  constructor(message: string, technicalDetail: string, attempts: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.technicalDetail = technicalDetail
    this.attempts = attempts
  }
}

function rawErrorDetail(err: unknown): string {
  return String(err)
    .replace(/^Error:\s*/, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700)
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
function cleanApiError(err: unknown, attempts = 1): string {
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
  if (raw.toLowerCase().includes('terminated')) {
    return 'Kết nối API bị ngắt giữa chừng sau 3 lần thử lại. Hãy giảm số dự án chạy đồng thời rồi tiếp tục.'
  }
  return attempts > 1 ? `${raw} (đã thử ${attempts} lần)` : raw
}

// ===== Retry logic =====
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 3000

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(err: unknown): boolean {
  const errStr = String(err).toLowerCase()
  return (
    /api error 5\d\d/.test(errStr) ||
    errStr.includes('429') ||
    errStr.includes('terminated') ||
    errStr.includes('und_err_socket') ||
    errStr.includes('timeout') ||
    errStr.includes('timed out') ||
    errStr.includes('econnreset') ||
    errStr.includes('econnrefused') ||
    errStr.includes('etimedout') ||
    errStr.includes('epipe') ||
    errStr.includes('enetreset') ||
    errStr.includes('enetunreach') ||
    errStr.includes('eai_again') ||
    errStr.includes('socket hang up') ||
    errStr.includes('fetch failed') ||
    errStr.includes('networkerror')
  )
}

export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions,
  owner?: string
): Promise<string> {
  let lastError: unknown
  let attempts = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt + 1
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
      const delayMs = RETRY_DELAY_MS * (attempt + 1)
      console.warn(
        `[API] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`,
        String(err).slice(0, 200)
      )
      await sleep(delayMs)
    } finally {
      untrackRequest(owner, requestId)
    }
  }
  throw new ApiRequestError(cleanApiError(lastError, attempts), rawErrorDetail(lastError), attempts)
}

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options?: ChatOptions,
  owner?: string
): Promise<string> {
  let lastError: unknown
  let attempts = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt + 1
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
      const delayMs = RETRY_DELAY_MS * (attempt + 1)
      console.warn(`[API Stream] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`)
      await sleep(delayMs)
    } finally {
      cleanup()
      untrackRequest(owner, streamId)
    }
  }
  throw new ApiRequestError(cleanApiError(lastError, attempts), rawErrorDetail(lastError), attempts)
}

export async function testConnection(
  settings?: AppSettings
): Promise<{ success: boolean; models?: string[]; error?: string }> {
  try {
    const data = await window.api.testConnection(settings) as {
      data?: Array<{
        id: string
        type?: string
        capabilities?: string[] | Record<string, unknown>
        modality?: string | string[]
        model_id?: string
        model_type?: string
        provider_prefix?: string
      }>
    }
    const models = (data?.data || [])
      .filter((model) => isLlmModel(model, settings?.apiProvider))
      .map((model) => formatModelId(model, settings?.apiProvider))
      .filter(Boolean)
    return { success: true, models }
  } catch (err) {
    return { success: false, error: cleanApiError(err) }
  }
}

/** Keep the model picker focused on text/chat models, especially for Vilao's mixed catalog. */
export function isLlmModel(
  model: {
    id: string
    type?: string
    capabilities?: string[] | Record<string, unknown>
    modality?: string | string[]
    model_type?: string
  },
  provider?: AppSettings['apiProvider']
): boolean {
  const id = model.id.toLowerCase()
  const metadata = [
    model.type,
    ...(Array.isArray(model.capabilities) ? model.capabilities : Object.keys(model.capabilities || {})),
    ...(Array.isArray(model.modality) ? model.modality : [model.modality]),
    model.model_type
  ].filter(Boolean).join(' ').toLowerCase()

  if (/(image|text-to-image|t2i|video|audio|music|embedding|rerank|text-to-speech|tts|speech-to-text|whisper)/i.test(`${id} ${metadata}`)) {
    return false
  }

  // Vilao publishes media models with provider-specific names that may not include a type field.
  if (provider === 'vilao' && /^(wan|veo|sora|flux|sdxl|stable-diffusion|dall[-.]?e)([-_.]|$)/i.test(id)) {
    return false
  }

  return true
}

export function formatModelId(
  model: { id: string; model_id?: string; provider_prefix?: string },
  provider?: AppSettings['apiProvider']
): string {
  const id = (model.model_id || model.id).trim()
  const prefix = (model.provider_prefix || '').trim()
  if (provider === 'vilao' && prefix && !id.includes('/')) return `${prefix}/${id}`
  return id
}
