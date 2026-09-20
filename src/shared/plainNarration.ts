export const PLAIN_NARRATION_RULES = `PLAIN NARRATION OUTPUT — author-mandated, overrides conflicting typography advice: use only native-language letters (including vowel/tone marks), numbers, whitespace, periods and commas (including 。 and 、). No quotation marks, question/exclamation marks, brackets, emoji, ornament, markdown or screenplay labels. Dialogue remains ordinary prose on its own line; do not demand quotes or exclamation marks for shouts. A short spoken exclamation ending in a period is valid under this policy. Never restore forbidden punctuation during proofreading. Express quantities/units in words when symbols would carry meaning.`
/** Basic punctuation only; keep Unicode letters/marks, numbers and whitespace.
 * Offsets map original UTF-16 positions to cleaned memory-evidence positions. */
export function plainNarrationWithOffsets(source: string): { text: string; offsets: number[] } {
  let text = '', index = 0
  const offsets = new Array<number>(source.length + 1).fill(0)
  for (const char of source) {
    let value = char
    if (/\p{Variation_Selector}/u.test(char)) value = ''
    else if (/[!?…]/u.test(char)) value = '.'
    else if (/[！？]/u.test(char)) value = '。'
    else if (char === '，') value = '、'
    else if (char === '．') value = '.'
    else if (!/[\p{L}\p{M}\p{N}\s.,。、]/u.test(char)) value = /['"‘’“”「」『』«»]/u.test(char) ? '' : ' '
    if (/[.,。、]/u.test(value) && /[.,。、]$/u.test(text)) value = ''
    for (let i = 0; i < char.length; i++) offsets[index + i] = text.length
    text += value; index += char.length; offsets[index] = text.length
  }
  return { text, offsets }
}
export function plainNarration(text: string): string { return plainNarrationWithOffsets(text).text }
