import { findTextRepetitions } from './textRepetition'
// Author-reported TTS calibration, not a measurement of newly generated audio.
export const TTS_CALIBRATION_ID = 'author-ja-62500-chars-170-min-20260917'
export const AUTHOR_TTS_REFERENCE = {
  ja: { charsPerMinute: 62_500 / 170 },
  en: { charsPerMinute: (62_500 / 170) / 1.125 },
  // Thai's slight difference is provisional until the author supplies an audio sample.
  th: { charsPerMinute: (62_500 / 170) * 1.025 }
} as const

export function authorEstimatedMinutes(characters: number, language: string): number | null {
  const reference = AUTHOR_TTS_REFERENCE[language as keyof typeof AUTHOR_TTS_REFERENCE]
  return reference && Number.isFinite(characters) && characters >= 0 ? characters / reference.charsPerMinute : null
}

export function authorCharacterRange(minutes: number, language: string): { min: number; max: number; nominal: number } | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const japanese = minutes * AUTHOR_TTS_REFERENCE.ja.charsPerMinute
  const ratio = language === 'en' ? { min: 1 / 1.15, max: 1 / 1.1 } : language === 'th' ? { min: 1, max: 1.05 } : language === 'ja' ? { min: 1, max: 1 } : null
  return ratio ? { min: Math.round(japanese * ratio.min), max: Math.round(japanese * ratio.max), nominal: Math.round((japanese * ratio.min + japanese * ratio.max) / 2) } : null
}

export function authorCharacterTarget(minutes: number, language: string): number | null {
  return authorCharacterRange(minutes, language)?.nominal ?? null
}

export interface NarrationText {
  language: string
  generatedStory?: string
  longStory?: { accepted?: { estimatedMinutes: number }[]; plan?: { duration?: { targetCharacters?: unknown; estimatedMinutes?: unknown } } }
}

/** For uncalibrated languages keep the approved AI plan's pace stable, not each
 * review's changing guess. This remains an AI-plan estimate, never measured TTS. */
export function estimateProjectMinutes(project: NarrationText, characters: number): number | null {
  const calibrated = authorEstimatedMinutes(characters, project.language)
  if (calibrated !== null) return calibrated
  const plan = project.longStory?.plan?.duration
  if (!Number.isFinite(characters) || characters < 0 || typeof plan?.targetCharacters !== 'number' || !Number.isFinite(plan.targetCharacters) || plan.targetCharacters <= 0 || typeof plan.estimatedMinutes !== 'number' || !Number.isFinite(plan.estimatedMinutes) || plan.estimatedMinutes <= 0) return null
  return characters * plan.estimatedMinutes / plan.targetCharacters
}

/** Recalculate from prose, never use the requested minutes or a stale cached result. */
export function estimateWrittenDuration(project: NarrationText, text = project.generatedStory || '') {
  const normalized = text.trim().replace(/\s+/gu, ['ja', 'zh', 'th'].includes(project.language) ? '' : ' ')
  const characters = Array.from(normalized).length
  if (findTextRepetitions(text).length) return { characters, minutes: null, source: null, calibrationId: null }
  const calibrated = authorEstimatedMinutes(characters, project.language)
  if (!characters) return { characters, minutes: null, source: null, calibrationId: null }
  if (calibrated !== null) return { characters, minutes: calibrated, source: 'author-tts-calibration' as const, calibrationId: TTS_CALIBRATION_ID }
  const planned = estimateProjectMinutes(project, characters)
  if (planned !== null) return { characters, minutes: planned, source: 'ai-plan-ratio' as const, calibrationId: null }
  const accepted = project.longStory?.accepted
  const aiMinutes = accepted?.length && text === project.generatedStory && accepted.every(ch => Number.isFinite(ch.estimatedMinutes) && ch.estimatedMinutes > 0)
    ? accepted.reduce((sum, ch) => sum + ch.estimatedMinutes, 0) : null
  return { characters, minutes: aiMinutes, source: aiMinutes !== null ? 'ai-estimate' as const : null, calibrationId: null }
}

export function roundedMinutes(minutes: number): number { return Math.round(minutes * 10) / 10 }
