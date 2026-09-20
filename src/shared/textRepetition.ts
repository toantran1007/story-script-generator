export interface RepetitionSpan { start: number; end: number; unit: string; repeats: number }

/** Conservative mechanical corruption guard, not a stylistic repetition filter.
 * Offsets address the untouched UTF-16 string, including interleaved whitespace. */
export function findTextRepetitions(text: string): RepetitionSpan[] {
  const chars: string[] = [], starts: number[] = [], ends: number[] = []
  let offset = 0
  for (const char of text) {
    if (!/\s/u.test(char)) {
      // Keep indices for UTF-16 regex matches, including astral characters.
      for (let i = 0; i < char.length; i++) { starts.push(offset); ends.push(offset + char.length) }
      chars.push(char)
    }
    offset += char.length
  }
  const compact = chars.join(''), spans: RepetitionSpan[] = []
  const add = (match: RegExpMatchArray) => {
    const start = starts[match.index!], end = ends[match.index! + match[0].length - 1]
    if (!spans.some(s => start < s.end && end > s.start)) spans.push({ start, end, unit: match[1], repeats: match[0].length / match[1].length })
  }
  for (const match of compact.matchAll(/(.)\1{127,}/gu)) add(match)
  for (const match of compact.matchAll(/([wｗ])\1{2,}/giu)) {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(compact.slice(Math.max(0, match.index! - 2), match.index))) add(match)
  }
  for (const match of compact.matchAll(/(.{2,128}?)\1{7,}/gu)) {
    if (Array.from(match[0]).length >= 512) add(match)
  }
  return spans.sort((a, b) => a.start - b.start)
}

export class TextRepetitionError extends SyntaxError {
  readonly code = 'text_repetition'
  constructor(spans: RepetitionSpan[]) {
    super(`Phát hiện lặp bất thường; chưa chấp nhận văn bản. ${spans.slice(0, 4).map(s => `offset ${s.start}, ${s.end - s.start} ký tự, mẫu ${JSON.stringify(s.unit.slice(0, 24))} lặp ${s.repeats} lần`).join('; ')}. Repair only the degenerate repetition into a brief natural expression; preserve all surrounding events and the ending. Never pad length with repeated characters.`)
    this.name = 'TextRepetitionError'
  }
}

export function assertNoTextRepetition(text: string): void {
  const spans = findTextRepetitions(text)
  if (spans.length) throw new TextRepetitionError(spans)
}

export function repetitionRepairContext(text: string): string {
  const spans = findTextRepetitions(text)
  if (!spans.length) return ''
  return `LOCAL REPETITION SPANS (computed from the ORIGINAL draft): ${JSON.stringify(spans.map((s, i) => ({ repetitionId: 'R' + (i + 1), start: s.start, end: s.end, unit: s.unit, repeats: s.repeats, preceding: text.slice(Math.max(0, s.start - 60), s.start), following: text.slice(s.end, s.end + 60) })))}\nRepair these spans using edits {"repetitionId":"R1","after":"brief natural replacement"}, with NO before field. The app resolves the exact original span locally so you must NOT copy thousands of repeated characters or invent offsets. Preserve all surrounding prose. Use ordinary before/after edits for other changes, never overlap them with these spans. Regenerate memory for the corrected text.`
}

/** Counting only: never used to mutate or silently clean a manuscript. */
export function textWithoutRepetitionForCounting(text: string): string {
  let result = text
  for (const span of findTextRepetitions(text).reverse()) result = result.slice(0, span.start) + result.slice(span.end)
  return result
}
