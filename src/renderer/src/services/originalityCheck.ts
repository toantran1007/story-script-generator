import type { InspirationProfile, Outline } from '@/types'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function outlineText(outline: Outline): string {
  return [
    outline.title,
    outline.outlineSummary,
    ...outline.chapters.flatMap((chapter) => [chapter.title, chapter.summary])
  ].join('\n')
}

export function findForbiddenFingerprints(
  outline: Outline,
  profile: InspirationProfile
): string[] {
  const content = ` ${normalize(outlineText(outline))} `
  const candidates = [
    ...profile.forbiddenNames,
    ...profile.forbiddenSettings,
    ...profile.forbiddenObjects,
    ...profile.forbiddenPlotBeats,
    ...profile.forbiddenTwists
  ]

  return Array.from(new Set(candidates.filter((candidate) => {
    const normalized = normalize(candidate)
    return normalized.length >= 4 && content.includes(` ${normalized} `)
  })))
}
