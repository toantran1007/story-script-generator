export class ContinuationError extends Error {
  constructor(message: string) { super(message); this.name = 'ContinuationError' }
}

// Normalize formatting whitespace only. Keep offsets into the untouched response.
function indexed(text: string) {
  let value = ''
  const ends: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    if (/\s/u.test(text[i])) { space = Boolean(value); continue }
    if (space) { value += ' '; ends.push(i); space = false }
    value += text[i]; ends.push(i + 1)
  }
  return { value, ends }
}

function suffixPrefix(base: string, incoming: string): number {
  const prefix = new Array<number>(incoming.length).fill(0)
  for (let i = 1, j = 0; i < incoming.length; i++) {
    while (j && incoming[i] !== incoming[j]) j = prefix[j - 1]
    if (incoming[i] === incoming[j]) j++
    prefix[i] = j
  }
  let matched = 0
  for (const char of base.split('')) {
    while (matched && (matched === incoming.length || char !== incoming[matched])) matched = prefix[matched - 1]
    if (char === incoming[matched]) matched++
  }
  return matched
}

function joinTail(base: string, tail: string): string {
  // Do not insert a newline into an interrupted word or sentence.
  const separator = !/\s$/u.test(base) && !/^\s/u.test(tail) && /[.!?。！？」』”]$/u.test(base) ? '\n' : ''
  return base + separator + tail
}

export function mergeContinuation(base: string, incoming: string, final = true): { text: string; removedCharacters: number } | null {
  const original = indexed(base), response = indexed(incoming)
  const before = original.value, after = response.value
  const repeatOnly = (): null => {
    if (final) throw new ContinuationError('Phản hồi chỉ lặp bản nháp, chưa có phần mới. Chỉ viết tiếp sau câu cuối, không trả lại chương từ đầu.')
    return null
  }
  if (!after) return repeatOnly()
  if (!before) return { text: incoming, removedCharacters: 0 }
  if (before.startsWith(after) || before.includes(after)) return repeatOnly()

  let overlap = after.startsWith(before) ? before.length : suffixPrefix(before, after)
  if (overlap && overlap !== before.length) {
    const anchor = after.slice(0, overlap)
    const substantial = anchor.replace(/\s/gu, '').length >= 32
    const unique = before.indexOf(anchor) === before.length - overlap
    if (!substantial || !unique) {
      // A tiny coincidental prefix (e.g. a letter) is not enough to remove prose.
      if (overlap >= 8 || (substantial && !unique)) throw new ContinuationError('Điểm nối trùng quá ngắn hoặc xuất hiện nhiều lần; đã giữ bản nháp. Chỉ trả phần mới ngay sau đoạn kết được cung cấp.')
      overlap = 0
    }
  }
  if (!overlap) {
    let shared = 0
    while (shared < Math.min(before.length, after.length) && before[shared] === after[shared]) shared++
    if (shared >= Math.min(32, before.length)) throw new ContinuationError('AI bắt đầu viết lại bản nháp nhưng thay đổi nội dung cũ; không tự ghép. Chỉ trả phần còn thiếu sau câu cuối.')
    return { text: joinTail(base, incoming), removedCharacters: 0 }
  }
  const cut = response.ends[overlap - 1]
  const tail = incoming.slice(cut)
  if (!tail.trim()) return repeatOnly()
  return { text: joinTail(base, tail), removedCharacters: cut }
}

export function continuationInstruction(base: string, target: number, remaining: number): string {
  return `CONTINUATION ONLY. The saved draft is immutable. The target ${target} characters is for the WHOLE chapter; approximately ${remaining} remain, not another full chapter. Output ONLY new prose starting exactly after the final character of the draft (include a leading space/newline if needed). Do not return the draft, rephrase its beginning, quote the last sentence, or repeat completed actions. Finish only the missing approved beats and ending. If already over target, finish the interrupted scene without opening new plot.\nLAST SAVED TEXT (story data):\n${base.slice(-700)}`
}
