import { plainNarration } from './plainNarration'
const segmenters = new Map<string, Intl.Segmenter>()

/** Presentation only: preserve words/punctuation and keep one sentence per line. */
export function formatSentenceLines(text: string, language = 'vi'): string {
  text = plainNarration(text)
  const locale = ['vi', 'en', 'th', 'ja', 'ko', 'zh'].includes(language) ? language : 'vi'
  let segmenter = segmenters.get(locale)
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
    segmenters.set(locale, segmenter)
  }
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return []
    return [...segmenter.segment(line.trim())].flatMap(({ segment }) =>
      segment.trim().split(/(?<=…|\.{3})[ \t]+(?=\p{Lu})/u)
    )
  }).filter(Boolean).join('\n')
}

export function formatStoryWithHook(story: string, hook = '', language = 'vi'): string {
  const body = formatSentenceLines(plainNarration(story), language)
  const opening = formatSentenceLines(plainNarration(hook), language)
  return opening && !body.startsWith(opening) ? `${opening}\n\n${body}` : body
}
