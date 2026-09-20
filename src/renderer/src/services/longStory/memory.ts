import type { Project } from '@/types'
import { selectMemoryContext } from '@/services/detailedMemory'
import { revisionKey } from '@/services/longStory/planner'
import type { HistoryCheckpoint } from './types'
import { nativeSpellingContext } from '@/services/languageIntegrity'
import { chapterScopeContext } from '@/services/longStory/crossChapterRepetition'

export function historyCheckpoints(project: Project): HistoryCheckpoint[] {
  const chapters = (project.chapterMemories || []).filter(ch => ch.complete).sort((a, b) => a.chapter - b.chapter)
  const cold = chapters.slice(0, Math.max(0, chapters.length - 4))
  const checkpoints: HistoryCheckpoint[] = []
  // Reuse accepted chapter summaries, not fresh speculative model facts.
  // Full summaries and prose remain on disk; only context excerpts are bounded.
  for (let i = 0; i < cold.length; i += 8) {
    const group = cold.slice(i, i + 8)
    const sourceKey = revisionKey(JSON.stringify(group.map(ch => [ch.chapter, ch.summary, project.chapterDocuments?.find(d => d.chapter === ch.chapter)?.text])))
    const cached = project.longStory?.checkpoints.find(cp => cp.sourceKey === sourceKey)
    checkpoints.push(cached || { from: group[0].chapter, to: group[group.length - 1].chapter, sourceKey, summary: group.map(ch => `[${ch.chapter}] ${ch.summary.slice(0, 450)}`).join('\n') })
  }
  return checkpoints
}
export function longStoryContext(project: Project, chapter: number, query: string): string {
  const history = historyCheckpoints(project)
  const distant = history.slice(0, -3).map(cp => `[${cp.from}-${cp.to}] ${cp.summary.slice(0, 220)}`).join('\n').slice(-3000)
  return JSON.stringify({
    canon: project.longStory?.plan.canon || [],
    spellingContext: nativeSpellingContext(project, chapter),
    chapterScope: chapterScopeContext(project, chapter),
    relevantMemory: JSON.parse(selectMemoryContext(project, chapter, 20000, query)),
    distantHistory: distant, history: history.slice(-3),
    recent: (project.chapterMemories || []).filter(ch => ch.chapter < chapter).slice(-4),
    previousEnding: project.chapterDocuments?.find(d => d.chapter === chapter - 1)?.text.slice(-2000) || '',
    warning: 'Summaries are context excerpts, not replacements for full source or permission to overwrite canon. Never infer that omitted history did not happen.'
  })
}
