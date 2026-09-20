import type { Project } from '@/types'
import type { StoryPlan } from './types'
import { planInputKey, revisionKey } from '@/services/longStory/planner'

// Caller must back up the original snapshot before persisting this conversion.
// Accepted chapters stay byte-identical; no model call or silent prose rewrite.
export function convertLegacyProject(project: Project, plan: StoryPlan): Project {
  const next = structuredClone(project)
  const docs = [...(next.chapterDocuments || [])].filter(d => d.complete).sort((a, b) => a.chapter - b.chapter)
  if ((next.chapterDocuments || []).some(d => !d.complete)) throw new Error('Có khối chương cũ chưa hoàn thành; cần hoàn tất hoặc tách bản nháp trước khi chuyển đổi')
  if (docs.some((d, i) => d.chapter !== i + 1) || docs.length > plan.chapters.length) throw new Error('Không chuyển đổi khi thiếu/không liên tục chương đã lưu')
  if (next.generatedStory.trim() && !docs.length) throw new Error('Truyện cũ chưa có ranh giới chương; cần xác nhận chia chương trước khi chuyển đổi')
  for (const doc of docs) {
    const old = next.outline?.chapters[doc.chapter - 1], approved = plan.outline.chapters[doc.chapter - 1]
    if (!old || !approved || old.title !== approved.title || old.summary !== approved.summary) throw new Error('Không được đổi dàn ý chương đã hoàn thành khi chuyển đổi')
  }
  next.writingEngine = 'long-v3'
  next.outline = plan.outline
  next.longStory = { version: 1, plan: { ...plan, inputKey: planInputKey(next) }, cursor: docs.length,
    stage: next.pendingChapter && !next.pendingChapter.truncated ? 'review' : 'write', attempt: 0,
    draft: next.pendingChapter?.text, truncated: next.pendingChapter?.truncated,
    originalDraft: next.pendingChapter?.originalText,
    accepted: docs.map(d => ({ chapter: d.chapter, revision: revisionKey(d.text), estimatedMinutes: plan.chapters[d.chapter - 1].estimatedMinutes })), checkpoints: [] }
  next.status = 'writing'; next.outlinePhase = 'writing'
  return next
}
