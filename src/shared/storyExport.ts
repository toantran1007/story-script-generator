import { estimateWrittenDuration, roundedMinutes } from './narrationDuration'
import { assertNoTextRepetition } from './textRepetition'
import { plainNarration } from './plainNarration'

export interface ExportableStory {
  id: string; name: string; language: string; customLanguage?: string; style: string; customStyle?: string; duration: number
  generatedStory?: string; hookText?: string; outline?: unknown
  chapterDocuments?: { chapter: number; text: string; complete: boolean }[]
  longStory?: { plan: { duration: { estimatedMinutes?: number; targetCharacters?: number; actualEstimatedMinutes?: number; actualCharacters?: number; [key: string]: unknown } }; accepted: { chapter: number; estimatedMinutes: number }[] }
}

// Explicit allowlist: never export settings, credentials, temp paths or raw requests.
export function exportStoryJSON(p: ExportableStory): string {
  assertNoTextRepetition(p.generatedStory || '')
  assertNoTextRepetition(p.hookText || '')
  const timing = estimateWrittenDuration(p)
  const minutes = timing.minutes === null ? null : roundedMinutes(timing.minutes)
  return JSON.stringify({ schemaVersion: 1, format: 'kichban-story', id: p.id, name: p.name,
    language: p.language, customLanguage: p.customLanguage || '', style: p.style, customStyle: p.customStyle || '',
    requestedMinutes: p.duration, durationSource: timing.source, calibrationId: timing.calibrationId, actualTtsMeasured: false,
    durationPlan: p.longStory ? { ...p.longStory.plan.duration, actualCharacters: timing.characters, actualEstimatedMinutes: minutes,
      actualEstimateSource: timing.source, actualCalibrationId: timing.calibrationId } : null,
    estimatedMinutes: minutes, actualCharacters: timing.characters,
    generatedStory: plainNarration(p.generatedStory || ''), hookText: plainNarration(p.hookText || ''), outline: p.outline || null,
    chapters: (p.chapterDocuments || []).map(ch => ({ chapter: ch.chapter, text: plainNarration(ch.text), complete: ch.complete })) }, null, 2)
}
