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
  if (!text.trim() || language === 'vi') return false

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
