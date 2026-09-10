export function verifiedHookExcerpt(story: string, raw: string, maxChars: number): string {
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { excerpt?: unknown }
  if (!parsed || typeof parsed.excerpt !== 'string') throw new Error('Hook phải trả về đoạn trích nguyên văn')
  const excerpt = parsed.excerpt.trim()
  if (!excerpt || excerpt.length > maxChars || !story.includes(excerpt)) throw new Error('Hook không phải đoạn trích nguyên văn hoặc vượt độ dài')
  const start = story.indexOf(excerpt)
  if (start > 0 && !/[\n.!?…。！？]["'”’」』]*\s*$/.test(story.slice(Math.max(0, start - 12), start))) throw new Error('Hook cắt giữa câu')
  if (!/[.!?…。！？]["'”’」』]*$/.test(excerpt)) throw new Error('Hook chưa kết thúc ở ranh giới câu')
  return excerpt
}
