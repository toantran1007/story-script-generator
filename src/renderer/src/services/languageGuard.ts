import type { Language } from '@/types'

const VIETNAMESE_DIACRITICS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/giu
const VIETNAMESE_WORDS = /\b(?:và|là|của|nhưng|không|một|những|được|trong|với|người|cô|anh|ông|bà|chúng|tôi|đã|khi|rằng|này|đó)\b/giu
const VIETNAMESE_NAMES = /\b(?:nguyen|tran|pham|hoang|huynh|phan|dang|bui|duong|minh|lan|linh|huy|thao|tuan|phuong|quang|khanh|trang|nhung|ngoc)\b/giu

export function isThaiTarget(language: Language, customLanguage?: string): boolean {
  if (language === 'th') return true
  if (language !== 'custom') return false
  return /(?:thai|tiếng\s*thái|ภาษาไทย)/iu.test(customLanguage || '')
}

export function hasTargetLanguageLeak(
  text: string,
  language: Language,
  customLanguage?: string
): boolean {
  if (!text.trim()) return false
  if (language !== 'custom') {
    const letters = (text.match(/\p{L}/gu) || []).length
    const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) || []).length
    if (cyrillic >= 8 && cyrillic / Math.max(1, letters) > 0.2) return true
  }
  if (language === 'vi') return false
  const japanese = language === 'ja' || (language === 'custom' && /(?:japanese|tiếng\s*nhật|日本語)/iu.test(customLanguage || ''))
  if (japanese) {
    // Detect foreign sentences even when a long Japanese chapter dilutes the ratio.
    // Single acronyms/proper names are left to contextual proofreading.
    if (/[A-Za-z]{2,}(?:[ \t\r\n]+[A-Za-z][A-Za-z'’-]*){2,}/u.test(text)) return true
    if (/\b(?:Thank\s+you|You\s+saved|I\s+love|Oh\s+my)\b/iu.test(text)) return true
  }

  if (isThaiTarget(language, customLanguage)) {
    const thaiCount = (text.match(/\p{Script=Thai}/gu) || []).length
    const latinCount = (text.match(/\p{Script=Latin}/gu) || []).length
    const normalizedLatin = text.normalize('NFD').replace(/\p{Mark}/gu, '').replace(/đ/giu, 'd')
    const vietnameseNameCount = (normalizedLatin.match(VIETNAMESE_NAMES) || []).length
    if (thaiCount === 0) return true
    if (vietnameseNameCount > 0) return true
    if (latinCount >= 8 && latinCount / (thaiCount + latinCount) > 0.015) return true
  }

  const diacriticCount = (text.match(VIETNAMESE_DIACRITICS) || []).length
  const wordCount = (text.match(VIETNAMESE_WORDS) || []).length
  return diacriticCount >= 3 || wordCount >= 3
}
