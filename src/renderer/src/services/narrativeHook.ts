import type { Language } from '@/types'
import { assertNoTextRepetition } from '@shared/textRepetition'
import { plainNarration } from '@shared/plainNarration'
import { hasTargetLanguageLeak, isThaiTarget } from '@/services/languageGuard'
import { narrationChars } from '@/services/textMetrics'
import { assertCinematicSafety } from '@/services/cinematicSafety'

/** A rewritten teaser with a verified scene anchor, never an edit to story prose. */
export function parseNarrativeHook(story: string, raw: string, targetChars: number, language: Language, customLanguage?: string): string {
  assertNoTextRepetition(story)
  const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  if (!value || typeof value.hook !== 'string' || !value.hook.trim()) throw new Error('Thiếu hook: trả JSON có hook và sourceExcerpt')
  if (typeof value.sourceExcerpt !== 'string' || value.sourceExcerpt.trim().length < 12 || !story.includes(value.sourceExcerpt.trim())) throw new Error('sourceExcerpt không khớp cảnh gốc; chọn và chép nguyên văn một đoạn dẫn chứng có thật trong truyện')
  const hook = value.hook.trim(), length = narrationChars(hook, language)
  assertNoTextRepetition(hook)
  if (length < Math.floor(targetChars * 0.425) || length > Math.ceil(targetChars * 1.15)) throw new Error(`Hook dài ${length} ký tự; cần khoảng ${Math.floor(targetChars / 2)}–${targetChars} ký tự cho 1–2 phút. Biên soạn lại đủ câu, không cắt giữa câu.`)
  if (hasTargetLanguageLeak(hook, language, customLanguage)) throw new Error('Hook lẫn ngôn ngữ; dùng đúng ngôn ngữ truyện')
  // Thai commonly ends complete sentences without a full stop. Japanese dialogue
  // may end with a closing quote alone; neither is an incomplete sentence error.
  const closing = /[.!?…。！？]["'”’」』»）)\]]*$/u.test(hook)
  const japaneseDialogue = language === 'ja' && /[」』]$/u.test(hook)
  const thai = isThaiTarget(language, customLanguage) && !/[,:;，、：；\-–—]$/u.test(hook)
  if (!closing && !japaneseDialogue && !thai && language !== 'custom') throw new Error('Hook có vẻ kết thúc giữa câu; hãy viết câu cuối trọn vẹn, không thêm nội dung ngoài truyện')
  for (const [open, close] of [['「', '」'], ['『', '』'], ['“', '”'], ['«', '»']]) {
    let depth = 0
    for (const char of hook) { if (char === open) depth++; if (char === close) depth--; if (depth < 0) break }
    if (depth !== 0) throw new Error('Hook có dấu ngoặc thoại chưa khép đúng; biên soạn lại câu thoại trọn vẹn')
  }
  assertCinematicSafety(hook)
  return plainNarration(hook)
}
