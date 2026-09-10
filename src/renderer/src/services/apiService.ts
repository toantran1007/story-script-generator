import { v4 as uuidv4 } from 'uuid'
import type { AppSettings, ChatMessage, ChatOptions } from '@/types'

// ===== Cancellation =====
// "owner" là id dự án (pid). Mọi request của một dự án được gom theo owner
// để nút Dừng có thể huỷ toàn bộ request đang bay của riêng dự án đó.
const activeByOwner = new Map<string, Set<string>>()
const cancelledOwners = new Set<string>()
const idleWaiters = new Map<string, Set<() => void>>()
const VILAO_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.7-flash-high': 'anxs/gemini-3.7-flash-high',
  'gpt-5.6-sol': 'cd/gpt-5.6-sol'
}

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
}

export function waitOwnerIdle(owner: string): Promise<void> {
  if (!activeByOwner.get(owner)?.size) return Promise.resolve()
  return new Promise((resolve) => {
    const waiters = idleWaiters.get(owner) || new Set<() => void>()
    waiters.add(resolve); idleWaiters.set(owner, waiters)
  })
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
  if (!activeByOwner.get(owner)?.size) {
    idleWaiters.get(owner)?.forEach((resolve) => resolve())
    idleWaiters.delete(owner)
  }
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
  if (/api_(empty_content|empty_choices|output_incomplete|refusal|response_error|stream_invalid|wait_limit)/.test(errStr)) return false
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
      const response = await window.api.chat(messages, options, requestId)
      if (owner && isCancelled(owner)) throw new CancelledError()
      return response
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
  owner?: string,
  onFinish?: (reason: string | null) => void
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
      const response = onFinish
        ? await window.api.chatStreamDetailed(messages, options, streamId)
        : await window.api.chatStream(messages, options, streamId)
      if (owner && isCancelled(owner)) throw new CancelledError()
      if (typeof response === 'string') return response
      onFinish?.(response.finishReason)
      return response.text
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
    const data = await window.api.testConnection(settings) as unknown
    return { success: true, models: extractModelIds(data, settings?.apiProvider) }
  } catch (err) {
    return { success: false, error: cleanApiError(err) }
  }
}

/** Keep the model picker focused on text/chat models, especially for Vilao's mixed catalog. */
export function isLlmModel(
  model: {
    id?: string
    model_id?: string
    model?: string
    name?: string
    slug?: string
    type?: string
    capabilities?: string[] | Record<string, unknown>
    modality?: string | string[]
    model_type?: string
  },
  provider?: AppSettings['apiProvider']
): boolean {
  const id = (model.model_id || model.id || model.model || model.slug || model.name || '').toLowerCase()
  if (!id) return false
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
  model: {
    id?: string
    model_id?: string
    model?: string
    name?: string
    slug?: string
    provider_prefix?: string
    providerPrefix?: string
    provider?: string
    provider_id?: string
    providerId?: string
    owned_by?: string
    owner?: string
  },
  provider?: AppSettings['apiProvider']
): string {
  const id = (model.model_id || model.id || model.model || model.slug || model.name || '').trim()
  const rawPrefix = model.provider_prefix || model.providerPrefix || model.provider_id ||
    model.providerId || model.provider || model.owned_by || model.owner || ''
  const prefix = rawPrefix.trim()
  const isSafePrefix = /^[a-z0-9][a-z0-9_-]{1,15}$/i.test(prefix)
  if (provider === 'vilao' && isSafePrefix && !id.includes('/')) return `${prefix}/${id}`
  return provider === 'vilao' ? (VILAO_MODEL_ALIASES[id] || id) : id
}

type ApiModelRecord = {
  id?: string
  model_id?: string
  model?: string
  name?: string
  slug?: string
  providerPrefix?: string
  provider?: string
  provider_id?: string
  providerId?: string
  type?: string
  capabilities?: string[] | Record<string, unknown>
  modality?: string | string[]
  model_type?: string
  provider_prefix?: string
  owned_by?: string
  owner?: string
}

/** Normalize the different model-list envelopes used by OpenAI-compatible providers. */
export function extractModelIds(
  payload: unknown,
  provider?: AppSettings['apiProvider']
): string[] {
  const records: ApiModelRecord[] = []
  const identityKeys = ['id', 'model_id', 'model', 'name', 'slug'] as const

  const visit = (value: unknown, mapKey?: string, depth = 0): void => {
    if (depth > 6 || value === null || value === undefined) return
    if (typeof value === 'string') {
      const id = value.trim()
      if (id) records.push({ id: id.includes('/') || !mapKey ? id : mapKey })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, undefined, depth + 1))
      return
    }
    if (typeof value !== 'object') return

    const object = value as Record<string, unknown>
    const nestedContainers = ['data', 'models', 'items', 'results']
      .filter((key) => object[key] && typeof object[key] === 'object')
    if (nestedContainers.length > 0) {
      nestedContainers.forEach((key) => visit(object[key], key, depth + 1))
      return
    }

    const hasIdentity = identityKeys.some((key) => typeof object[key] === 'string' && object[key]?.trim())
    if (hasIdentity) {
      records.push(object as ApiModelRecord)
      return
    }

    if (mapKey && !['data', 'models', 'items', 'results'].includes(mapKey)) {
      records.push({ ...object, id: mapKey })
      return
    }

    Object.entries(object).forEach(([key, child]) => {
      // Object-map catalogs commonly use the model id as the property name.
      if (typeof child === 'string') {
        const candidate = child.trim()
        const looksLikeModelId = candidate.includes('/') || /^(gpt|gemini|claude|llama|qwen|mistral|deepseek|command|o\d)/i.test(candidate)
        records.push(looksLikeModelId ? { id: key, model_id: candidate } : { id: key })
      } else {
        visit(child, key, depth + 1)
      }
    })
  }

  visit(payload)
  return Array.from(new Set(records
    .filter((record) => isLlmModel(record, provider))
    .map((record) => formatModelId(record, provider))
    .filter(Boolean)))
}
