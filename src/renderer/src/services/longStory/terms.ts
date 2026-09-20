// Dictionary-free retrieval for mixed Latin, CJK and Thai text.
export function knowledgeTerms(text: string): Set<string> {
  const terms = new Set(text.match(/[\p{L}\p{N}_-]{2,}/gu) || [])
  for (const run of text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]+/gu) || []) {
    const chars = Array.from(run)
    for (let i = 1; i < chars.length; i++) terms.add(chars[i - 1] + chars[i])
  }
  return terms
}
