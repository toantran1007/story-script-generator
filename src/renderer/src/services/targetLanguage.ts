import type { Language } from '@/types'

const TARGET_NAMES: Record<Exclude<Language, 'custom'>, string> = {
  vi: 'Vietnamese', en: 'English', th: 'Thai', ja: 'Japanese', ko: 'Korean', zh: 'Chinese'
}

/** Inactive custom values must never override an explicitly selected language. */
export function targetLanguage(language: Language, customLanguage?: string): string {
  if (language !== 'custom') return TARGET_NAMES[language]
  const selected = customLanguage?.trim()
  if (!selected) throw new Error('Chưa nhập ngôn ngữ tùy chỉnh')
  return selected
}
