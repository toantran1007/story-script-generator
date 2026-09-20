import type { AppSettings } from '@/types'

const modelIdentity = (model: string): string => model.split('/').at(-1)!.toLowerCase()
/** One run, same configured provider only. Never persist credentials or change settings. */
export function modelFallback(read: () => AppSettings, catalog: () => Promise<string[]>, stopped: () => boolean) {
  const initial = read()
  const source = JSON.stringify([initial.apiProvider, initial.apiBaseUrl, initial.apiKey, initial.model])
  const used = new Set([modelIdentity(initial.model)])
  let override: string | undefined
  const unchanged = (): boolean => JSON.stringify([read().apiProvider, read().apiBaseUrl, read().apiKey, read().model]) === source
  return {
    current: (): string | undefined => unchanged() ? override : undefined,
    next: async (): Promise<string | null> => {
      if (stopped() || !unchanged() || used.size >= 3) return null
      const models = await catalog()
      if (stopped() || !unchanged()) return null
      const candidates = models.filter(m => !used.has(modelIdentity(m)) && /gpt|gemini|claude|llama|qwen|mistral|deepseek/i.test(m) && !/image|video|audio|tts|embedding|rerank/i.test(m))
      candidates.sort((a, b) => Number(/flash|mini|small|haiku/i.test(b)) - Number(/flash|mini|small|haiku/i.test(a)))
      const next = candidates[0]
      if (!next) return null
      used.add(modelIdentity(next)); override = next
      return next
    }
  }
}
