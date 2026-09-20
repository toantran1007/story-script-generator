import type { Language } from '@/types'
import { textWithoutRepetitionForCounting } from '@shared/textRepetition'

/**
 * Tốc độ đọc thành tiếng, tính bằng KÝ TỰ mỗi phút (kể cả dấu cách).
 *
 * Vì sao dùng ký tự chứ không dùng "từ": tiếng Nhật, Trung, và một phần tiếng Hàn
 * không tách từ bằng dấu cách, nên mọi phép đếm theo `split(/\s+/)` đều vô nghĩa —
 * một truyện tiếng Nhật 7.400 ký tự bị đếm thành 334 "từ".
 *
 * Cách quy đổi:
 *   vi  ~200 âm tiết/phút × ~4,5 ký tự  ≈ 900
 *   en  ~180 từ/phút      × ~5,5 ký tự  ≈ 1000
 *   ja  đọc theo ký tự, cỡ giọng kể audiobook ≈ 350
 *   ko  ≈ 330    zh  ≈ 260
 */
export const CHARS_PER_MINUTE: Record<Language, number> = {
  vi: 900,
  en: 1000,
  th: 700,
  ja: 350,
  ko: 330,
  zh: 260,
  custom: 900
}

/** Ngôn ngữ không tách từ bằng dấu cách — phải đếm theo ký tự. */
const SPACELESS: Language[] = ['th', 'ja', 'zh']

export function narrationChars(text: string, language: Language): number {
  const normalized = textWithoutRepetitionForCounting(text || '').trim().replace(/\s+/gu, SPACELESS.includes(language) ? '' : ' ')
  return Array.from(normalized).length
}

export function durationAssessment(text: string, minutes: number, language: Language, override?: number) {
  const chars = narrationChars(text, language)
  const target = targetCharsFor(minutes, language, override)
  const ratio = target > 0 ? chars / target : 0
  return { chars, target, minutes: chars / charsPerMinute(language, override),
    outsideTolerance: ratio < 0.85, deviationPercent: Math.round((ratio - 1) * 100) }
}

/** Giới hạn hợp lệ cho tốc độ đọc tự khai (ký tự/phút). */
export const READING_SPEED_MIN = 100
export const READING_SPEED_MAX = 5000
export const DURATION_MIN = 1
export const DURATION_MAX = 600

export function normalizeDuration(minutes: number): number {
  const rounded = Math.round(minutes)
  if (!Number.isFinite(rounded)) return 30
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, rounded))
}

/**
 * Tốc độ đọc hiệu lực: người dùng tự khai (override > 0) thì dùng số đó,
 * không thì rơi về mặc định của ngôn ngữ.
 */
export function charsPerMinute(language: Language, override?: number): number {
  if (override && override >= READING_SPEED_MIN) {
    return Math.min(READING_SPEED_MAX, Math.round(override))
  }
  return CHARS_PER_MINUTE[language] ?? CHARS_PER_MINUTE.vi
}

/** Hạn mức ký tự cho toàn bộ truyện, suy ra từ thời lượng người dùng chọn. */
export function targetCharsFor(minutes: number, language: Language, override?: number): number {
  return Math.round(minutes * charsPerMinute(language, override))
}

export function chapterCountFor(totalChars: number): number {
  return Math.max(1, Math.ceil(totalChars / 6000), Math.round(totalChars / 5000))
}

export function chapterBudgetsFor(count: number, totalChars: number): number[] {
  if (count < 1) return []
  const base = Math.floor(totalChars / count)
  return Array.from({ length: count }, (_, i) => base + (i < totalChars % count ? 1 : 0))
}

/** Conservative output allowance, not an exact tokenizer or a prose length limit. */
export function chapterOutputBudget(language: Language, targetChars: number, writtenChars = 0): { remainingChars: number; maxTokens: number } {
  const tokensPerChar: Record<Language, number> = { en: 0.5, vi: 1, ja: 1.5, zh: 1.5, ko: 1.5, th: 2, custom: 2 }
  const remainingChars = Math.max(0, Math.round(targetChars - writtenChars))
  // A truncated final sentence/scene still needs room to conclude, even over target.
  const completionChars = Math.max(800, remainingChars)
  return { remainingChars, maxTokens: Math.min(16384, Math.max(2048, Math.ceil(completionChars * tokensPerChar[language]) + 1024)) }
}

/**
 * Cửa sổ HOOK mở màn: 2 phút nghe đầu tiên quyết định người xem ở lại hay rời đi.
 * Quy ra ký tự theo tốc độ đọc hiệu lực để biết những khối nào của chương 1
 * còn nằm trong cửa sổ này.
 */
export const HOOK_MINUTES = 2

export function hookCharsFor(language: Language, override?: number): number {
  return Math.round(HOOK_MINUTES * charsPerMinute(language, override))
}

/**
 * Chia hạn mức ký tự cho từng chương, theo đúng tỷ lệ `estimatedWords` mà AI đề xuất.
 * Tổng luôn khớp thời lượng, còn tỷ lệ dài/ngắn giữa các chương thì tôn trọng dàn ý.
 */
export function distributeCharBudget(
  chapters: { estimatedWords: number }[],
  minutes: number,
  language: Language,
  override?: number
): number[] {
  if (chapters.length === 0) return []
  const total = targetCharsFor(minutes, language, override)
  const sum = chapters.reduce((s, c) => s + (c.estimatedWords || 0), 0)
  const even = Math.round(total / chapters.length)
  if (sum <= 0) return chapters.map(() => Math.max(1, even))
  return chapters.map((c) => Math.max(1, Math.round((total * (c.estimatedWords || 0)) / sum)))
}

/** Đơn vị đo hiển thị cho người dùng, theo ngôn ngữ. */
export function countText(text: string, language: Language): { value: number; unit: string } {
  const t = (text || '').trim()
  if (!t) return { value: 0, unit: SPACELESS.includes(language) ? 'ký tự' : 'từ' }

  const tokens = t.split(/\s+/).filter(Boolean)
  // Ngôn ngữ không tách từ bằng dấu cách: ja/zh cố định, cộng thêm heuristic cho
  // custom (Thái, Lào, Khmer, Miến...) — "từ" trung bình dài bất thường nghĩa là
  // văn bản không dùng dấu cách tách từ, đếm "từ" khi đó vô nghĩa.
  const avgTokenLen = t.replace(/\s/g, '').length / tokens.length
  if (SPACELESS.includes(language) || avgTokenLen > 12) {
    return { value: narrationChars(t, language), unit: 'ký tự' }
  }
  return { value: tokens.length, unit: 'từ' }
}

/** Thời lượng đọc thành tiếng ước tính, tính theo ký tự nên đúng cho mọi ngôn ngữ. */
export function readingMinutes(text: string, language: Language, override?: number): number {
  const chars = narrationChars(text, language)
  if (chars === 0) return 0
  return Math.max(1, Math.ceil(chars / charsPerMinute(language, override)))
}
