import type { Project } from '@/types'

export const CHAPTER_SCOPE_RULES = `CHAPTER SCOPE — applies to EVERY genre:
The premise/canon describes author knowledge, not what a character already knows. Future chapter plans reserve events and revelations; they are not current-scene instructions. Advance ONLY the current chapter's approved events and stop at its ending. Do not complete a future chapter's payoff, discovery, departure, publication, relationship change or resolution early. Foreshadowing may create questions, not answer reserved revelations.
Before writing or accepting a scene, compare actor, action, object, result, time and knowledge source with completed event evidence. Do not re-stage an event as new simply because the outline still requests it or wording differs. Distinguish a brief acknowledged recap from replay, a recurring motif from the same outcome, and a genuinely new obstacle from a renamed duplicate. Respect explicit flashbacks/intentional repetition. Never invent a new genre-specific scenario to satisfy this rule.
If a prior chapter has already consumed the current beat, retain established facts and show the supported consequence rather than resetting history. If that would require a new plot choice, report unresolved and preserve the draft. If the current draft prematurely completes a future beat, minimally defer that completion and stop at the approved boundary, without padding to restore length.`

export function chapterScopeContext(project: Project, chapter: number) {
  const outlines = project.longStory?.plan.outline.chapters || project.outline?.chapters || []
  const plans = project.longStory?.plan.chapters || []
  const current = outlines.find(c => c.chapter === chapter)
  const currentPlan = plans.find(c => c.chapter === chapter)
  const future = outlines.filter(c => c.chapter > chapter).map(c => ({
    chapter: c.chapter, title: c.title, summary: c.summary,
    beats: plans.find(p => p.chapter === c.chapter)?.beats,
    ending: plans.find(p => p.chapter === c.chapter)?.ending
  }))
  const completed = (project.chapterMemories || []).filter(m => m.complete && m.chapter < chapter)
    .sort((a, b) => a.chapter - b.chapter)
    .map(m => ({ chapter: m.chapter, summary: m.summary, events: m.events, state: m.state,
      unverified: (project.memoryIssues || []).some(issue => issue.chapter === m.chapter) }))
  // Fail explicitly rather than silently dropping completed events/reserved endings.
  const context = { current: { outline: current, plan: currentPlan }, futureReserved: future, completed,
    instruction: 'Future plans are restrictions, NOT accomplished facts. Historical summaries are claims; resolve conflicts against source prose. Unverified memories are not independent proof.' }
  if (JSON.stringify(context).length > 90000) throw new Error('Ngữ cảnh ranh giới chương quá lớn; giữ bản nháp, cần thu gọn kế hoạch/lịch sử có kiểm tra.')
  return context
}

export function completedChapterEvidence(project: Project, chapter: number): string {
  return JSON.stringify(chapterScopeContext(project, chapter).completed)
}
