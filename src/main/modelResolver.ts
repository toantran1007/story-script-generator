export interface ModelSettingsLike {
  apiProvider?: string
  apiBaseUrl?: string
  model?: string
  apiProfiles?: Record<string, { model?: string; apiBaseUrl?: string }>
}

export interface ChatOptionsLike {
  model?: string
  temperature?: number
  maxTokens?: number
}

const VILAO_API_BASE_URL = 'https://api.vilao.ai/v1'
const VILAO_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.7-flash-high': 'anxs/gemini-3.7-flash-high',
  'gpt-5.6-sol': 'cd/gpt-5.6-sol'
}

function normalizeBaseUrl(value?: string): string {
  return (value || '').trim().replace(/\/+$/, '').toLowerCase()
}

export function isVilaoSettings(settings: ModelSettingsLike): boolean {
  return settings.apiProvider === 'vilao' || normalizeBaseUrl(settings.apiBaseUrl) === VILAO_API_BASE_URL
}

export function normalizeVilaoModelId(model?: string): string {
  const value = (model || '').trim()
  if (!value || value.includes('/')) return value
  return VILAO_MODEL_ALIASES[value] || value
}

/** Resolve the persisted/overridden model immediately before an API request. */
export function resolveApiModel(
  settings: ModelSettingsLike,
  overrideModel?: string
): string {
  const profileModel = settings.apiProfiles?.vilao?.model
  const selected = (overrideModel || settings.model || (isVilaoSettings(settings) ? profileModel : '') || '').trim()
  return isVilaoSettings(settings) ? normalizeVilaoModelId(selected) : selected
}

export function buildChatCompletionBody(
  settings: ModelSettingsLike & { temperature: number; maxTokens: number },
  messages: unknown,
  options?: ChatOptionsLike,
  stream = false
): Record<string, unknown> {
  return {
    model: resolveApiModel(settings, options?.model),
    messages,
    temperature: options?.temperature ?? settings.temperature,
    max_tokens: options?.maxTokens ?? settings.maxTokens,
    ...(stream ? { stream: true } : {})
  }
}
