import type { Language } from '@/types'

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
    return { value: t.replace(/\s/g, '').length, unit: 'ký tự' }
  }
  return { value: tokens.length, unit: 'từ' }
}

/** Thời lượng đọc thành tiếng ước tính, tính theo ký tự nên đúng cho mọi ngôn ngữ. */
export function readingMinutes(text: string, language: Language, override?: number): number {
  const chars = (text || '').trim().length
  if (chars === 0) return 0
  return Math.max(1, Math.ceil(chars / charsPerMinute(language, override)))
}
