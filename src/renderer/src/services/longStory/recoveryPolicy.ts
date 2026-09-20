import type { Project } from '@/types'
import { findTextRepetitions } from '@shared/textRepetition'
import { narrationChars } from '@/services/textMetrics'
import { authorCharacterTarget, estimateProjectMinutes } from '@shared/narrationDuration'
import { StoryPaused, type StoryPorts } from '@/services/longStory/types'

export type FailureKind = 'transport' | 'format' | 'memory' | 'length' | 'content' | 'permanent' | 'other'
export class StoryStageError extends Error {
  constructor(readonly kind: FailureKind, message: string, readonly retryStage?: 'write' | 'review') {
    super(message); this.name = 'StoryStageError'
  }
}
export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof StoryStageError) return error.kind
  if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'safety_rewrite_required') return 'content'
  if (error instanceof SyntaxError) return 'format'
  const message = error instanceof Error ? error.message : String(error)
  if (/401|403|unauthorized|forbidden|content_filter|API chặn|refusal|insufficient_quota|API_REFUSAL/i.test(message)) return 'permanent'
  if (/timeout|timed out|fetch failed|ECONN|network|terminated|429|502|503|504|API_(WAIT_LIMIT|EMPTY_CONTENT|EMPTY_CHOICES|OUTPUT_INCOMPLETE|RESPONSE_ERROR)|quá tải|không khả dụng|hết thời gian|mất kết nối/i.test(message)) return 'transport'
  if (/memory|dữ kiện|dẫn chứng/i.test(message)) return 'memory'
  return 'other'
}

export function chapterReadiness(project: Project, text: string) {
  const state = project.longStory!, plan = state.plan, chapter = plan.chapters[state.cursor]
  const actual = narrationChars(text, project.language)
  const previous = narrationChars(project.generatedStory, project.language)
  const calibratedTarget = authorCharacterTarget(plan.duration.requestedMinutes, project.language)
  const storyMinimum = Math.ceil(Math.max(plan.duration.targetCharacters, calibratedTarget || 0) * 0.85)
  const allocated = plan.chapters.slice(0, state.cursor + 1).reduce((sum, ch) => sum + ch.targetCharacters, 0)
  const cumulativeMinimum = Math.ceil(storyMinimum * allocated / plan.duration.targetCharacters)
  const missing = Math.max(0, cumulativeMinimum - previous - actual)
  return { actual, missing, valid: actual > 0 && !missing && !findTextRepetitions(text).length, storyMinimum,
    belowChapterBudget: actual < Math.ceil(chapter.targetCharacters * 0.85),
    estimatedMinutes: estimateProjectMinutes(project, actual) }
}

export async function waitForRecovery(ports: StoryPorts, milliseconds: number): Promise<void> {
  if (ports.wait) { await ports.wait(milliseconds); if (ports.stopped() || !ports.read()) throw new StoryPaused(); return }
  const end = Date.now() + milliseconds
  while (Date.now() < end) {
    if (ports.stopped() || !ports.read()) throw new StoryPaused()
    await new Promise(resolve => setTimeout(resolve, Math.min(250, end - Date.now())))
  }
  if (ports.stopped() || !ports.read()) throw new StoryPaused()
}
