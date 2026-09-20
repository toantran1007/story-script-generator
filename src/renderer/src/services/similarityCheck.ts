import type { DuplicateResult } from '@/types'

// Lexical warning only, NOT a calibrated semantic/plagiarism probability.
// CJK/Thai use script-local bigrams; spaced languages retain word tokens.
export const DUPLICATE_THRESHOLD = 0.15

// Hư từ tiếng Việt + tiếng Anh. Bỏ đi để độ giống phản ánh nội dung,
// không phải mật độ từ nối — nhờ vậy khoảng cách giữa "trùng" và "không trùng" rộng gấp ~6 lần.
const STOPWORDS = new Set(
  (
    'và của có là những một người trong đã được cho khi với nhưng ra vào lại thì mà nên như từ ' +
    'về đến các cả này đó nó anh cô mình rằng bị sẽ vẫn còn chỉ rồi trên dưới sau trước hơn để ' +
    'không chưa nữa mỗi vì do bởi cùng cũng nếu hay hoặc tại nơi ai gì sao thế nào ' +
    'the a an of and to in is that it his her their he she they with for on at by from as'
  ).split(' ')
)

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tập từ mang nghĩa của một đoạn văn. */
function contentWords(text: string): Set<string> {
  const normalized = normalize(text)
  const words = normalized.split(' ').flatMap(word => {
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(word)) return [word]
    const chars = Array.from(word)
    return chars.length === 1 ? chars : chars.slice(0, -1).map((char, i) => char + chars[i + 1])
  })
  const set = new Set<string>()
  for (const w of words) {
    if (w && !STOPWORDS.has(w)) set.add(w)
  }
  // Đoạn quá ngắn (toàn hư từ) thì giữ nguyên từ để vẫn so được
  if (set.size === 0) {
    for (const w of words) if (w) set.add(w)
  }
  return set
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }

  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function checkDuplicate(
  newOutline: string,
  existingStories: { id: string; title: string; outlineSummary: string }[]
): DuplicateResult {
  if (!existingStories.length || !newOutline.trim()) {
    return { isDuplicate: false, maxSimilarity: 0 }
  }

  const newWords = contentWords(newOutline)
  let maxSimilarity = 0
  let similarTo: string | undefined

  for (const story of existingStories) {
    if (!story.outlineSummary) continue
    const similarity = jaccardSimilarity(newWords, contentWords(story.outlineSummary))

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity
      similarTo = story.title
    }
  }

  return {
    isDuplicate: maxSimilarity > DUPLICATE_THRESHOLD,
    maxSimilarity: Math.round(maxSimilarity * 100) / 100,
    similarTo
  }
}
