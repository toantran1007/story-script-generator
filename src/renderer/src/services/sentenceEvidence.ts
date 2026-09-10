export interface EvidenceSentence { id: string; start: number; end: number; text: string }
export interface TextEdit { start: number; end: number; after: string }

export function evidenceSentences(text: string): EvidenceSentence[] {
  const sentences: EvidenceSentence[] = []
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
  for (const line of text.matchAll(/[^\r\n]+/gu)) {
    for (const part of segmenter.segment(line[0])) {
      const trimmed = part.segment.trim()
      if (!trimmed) continue
      const start = line.index! + part.index + part.segment.indexOf(trimmed)
      sentences.push({ id: `S${sentences.length + 1}`, start, end: start + trimmed.length, text: trimmed })
    }
  }
  return sentences
}

export function numberedDraft(text: string): string {
  return JSON.stringify(evidenceSentences(text).map(({ id, text }) => ({ id, text })))
}

export function correctedSentenceRange(sentence: EvidenceSentence, edits: TextEdit[], corrected: string): { start: number; end: number; quote: string } | null {
  let shift = 0, growth = 0
  for (const edit of edits) {
    if (edit.end <= sentence.start) shift += edit.after.length - (edit.end - edit.start)
    else if (edit.start < sentence.end) {
      // Cross-sentence replacements have no unambiguous sentence identity.
      if (edit.start < sentence.start || edit.end > sentence.end) return null
      growth += edit.after.length - (edit.end - edit.start)
    }
  }
  let start = sentence.start + shift, end = sentence.end + shift + growth
  const slice = corrected.slice(start, end), quote = slice.trim()
  if (!quote) return null
  start += slice.indexOf(quote); end = start + quote.length
  return { start, end, quote }
}
