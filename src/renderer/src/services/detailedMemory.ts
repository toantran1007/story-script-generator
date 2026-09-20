import type { Project, MemoryDelta, MemoryRecord, ChapterDocument, ChapterMemory, MemoryEvidenceIssue } from '@/types'
import type { MemoryPayload } from '@/services/chapterMemory'
import { stripNarrationMarkup } from '@/services/textCleanup'
import { knowledgeTerms } from '@/services/longStory/terms'

export const MEMORY_CONTEXT_BUDGET = 10_000
const normalize = (text: string): string => text.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/đ/g, 'd')
const unique = (items: string[]): string[] => [...new Set(items)]

function legacyId(text: string): string {
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `legacy-${(hash >>> 0).toString(16)}`
}

export function memoryRecordsFor(project: Project): MemoryRecord[] {
  const records = [...(project.memoryRecords || [])]
  const ids = new Set(records.map((r) => r.id))
  const add = (text: string, kind: 'fact' | 'thread' | 'event', chapter: number): void => {
    const id = legacyId(`${kind}:${text}`)
    if (ids.has(id)) return
    ids.add(id)
    records.push({ id, kind, subject: '', text, status: 'unknown', importance: 'normal', related: [], version: 1,
      source: { chapter, chunk: 0, start: 0, end: 0, quote: '', verified: false } })
  }
  if (!project.memoryRecords?.length) {
    project.storyMemory?.facts.forEach((text) => add(text, 'fact', 0))
    project.storyMemory?.openThreads.forEach((text) => add(text, 'thread', 0))
    for (const memory of project.chapterMemories || []) {
      memory.events.forEach((text) => add(text, 'event', memory.chapter))
      memory.state.forEach((text) => add(text, 'fact', memory.chapter))
      memory.openThreads.forEach((text) => add(text, 'thread', memory.chapter))
    }
  }
  return records
}

function evidenceRange(text: string, evidence: string): { range: { start: number; end: number; quote: string }; issue?: never } | { range?: never; issue: MemoryEvidenceIssue['code'] } {
  const clean = stripNarrationMarkup(evidence).trim()
  if (!clean) return { issue: 'not_found' }
  // Normalize only whitespace and typographic double quotes, never words, case or accents.
  const escaped = clean.split(/\s+/).map((part) => [...part].map((char) => /["“”„‟«»「」『』]/u.test(char)
    ? '["“”„‟«»「」『』]' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')).join('\\s+')
  const pattern = new RegExp(escaped, 'gu')
  const match = pattern.exec(text)
  if (!match) return { issue: 'not_found' }
  if (pattern.exec(text)) return { issue: 'ambiguous' }
  return { range: { start: match.index, end: match.index + match[0].length, quote: match[0] } }
}

export function applyMemoryPayload(project: Project, chapter: number, chunk: number, complete: boolean, text: string, payload: MemoryPayload): Partial<Project> {
  const documents = [...(project.chapterDocuments || [])]
  const previousDoc = documents.find((d) => d.chapter === chapter)
  if (previousDoc?.chunks.some((part) => part.chunk === chunk)) throw new Error('Khối này đã lưu; không ghi lặp nội dung hoặc memory.')
  const prefix = previousDoc?.text ? `${previousDoc.text}\n\n` : ''
  const document: ChapterDocument = { chapter, text: prefix + text, complete,
    legacyPrefixMissing: previousDoc?.legacyPrefixMissing || (!previousDoc && chunk > 0),
    chunks: [...(previousDoc?.chunks || []), { chunk, start: prefix.length, end: prefix.length + text.length }] }
  const records = new Map(memoryRecordsFor(project).map((r) => [r.id, r]))
  const history = [...(project.memoryHistory || [])]
  const issues = [...(project.memoryIssues || [])]
  const changes: MemoryDelta[] = payload.updates || []
  if (!payload.story && changes.length === 0 && records.size === 0) throw new Error('Khối đầu phải thiết lập ít nhất một dữ kiện có dẫn chứng.')
  for (const change of changes) {
    const before = records.get(change.id)
    if (before && before.kind !== change.kind) throw new Error(`Memory id không được đổi loại dữ kiện: ${change.id}; giữ kind=${before.kind}, không dùng kind=${change.kind}.`)
    const located = payload.evidenceRanges && Object.hasOwn(payload.evidenceRanges, change.id)
    const range = payload.evidenceRanges?.[change.id]
    const evidence = located
      ? range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length && text.slice(range.start, range.end) === range.quote
        ? { range } : { issue: 'not_found' as const }
      : evidenceRange(text, change.evidence)
    const { evidence: _quoted, ...fields } = change
    const issue: MemoryEvidenceIssue | undefined = evidence.issue ? {
      code: evidence.issue, recordId: change.id, chapter, chunk, suppliedEvidence: change.evidence,
      proposedText: change.text, proposedStatus: change.status, previousText: before?.text, storyChars: text.length
    } : undefined
    const after: MemoryRecord = { ...fields, version: (before?.version || 0) + 1,
      status: issue ? 'unknown' : change.status,
      importance: issue && before?.importance === 'core' ? 'core' : change.importance,
      source: evidence.range
        ? { chapter, chunk, start: prefix.length + evidence.range.start, end: prefix.length + evidence.range.end, quote: evidence.range.quote, verified: true }
        : { chapter, chunk, start: prefix.length, end: prefix.length + text.length, quote: '', verified: false },
      ...(issue ? { verificationIssue: issue } : {}) }
    if (issue) issues.push(issue)
    records.set(after.id, after)
    history.push({ chapter, chunk, before: before || null, after })
  }
  // Old V1 snapshots remain readable, but omitted legacy facts are not silently erased or asserted as current.
  if (payload.story) {
    for (const [kind, entries] of [['fact', [...payload.story.facts, ...payload.chapter.state]], ['thread', payload.story.openThreads], ['event', payload.chapter.events]] as const) {
      for (const value of entries) {
        const id = legacyId(`${kind}:${value}`)
        if (records.has(id)) continue
        const after: MemoryRecord = { id, kind, subject: '', text: value, status: 'unknown', importance: 'normal', related: [], version: 1,
          source: { chapter, chunk, start: prefix.length, end: prefix.length + text.length, quote: '', verified: false } }
        records.set(id, after); history.push({ chapter, chunk, before: null, after })
      }
    }
  }
  const previous = project.chapterMemories?.find((m) => m.chapter === chapter)
  const entry: ChapterMemory = { chapter, complete, summary: payload.chapter.summary,
    events: unique([...(previous?.events || []), ...payload.chapter.events]),
    state: payload.chapter.state.length ? payload.chapter.state : previous?.state || [], openThreads: payload.chapter.openThreads }
  const allRecords = [...records.values()]
  return {
    chapterDocuments: [...documents.filter((d) => d.chapter !== chapter), document].sort((a, b) => a.chapter - b.chapter),
    chapterMemories: [...(project.chapterMemories || []).filter((m) => m.chapter !== chapter), entry].sort((a, b) => a.chapter - b.chapter),
    memoryRecords: allRecords, memoryHistory: history, memoryIssues: issues,
    memoryPackets: [...(project.memoryPackets || []), { chapter, chunk, payload: JSON.parse(JSON.stringify(payload)) }],
    storyMemory: payload.updates === undefined && payload.story ? payload.story : { facts: allRecords.filter((r) => r.status === 'current' && r.kind !== 'thread').map((r) => r.text),
      openThreads: allRecords.filter((r) => r.status !== 'resolved' && r.kind === 'thread').map((r) => r.status === 'unknown'
        ? `[Chưa xác thực] ${r.verificationIssue?.previousText || r.text}` : r.text) }
  }
}

export function selectMemoryContext(project: Project, chapter: number, budget = MEMORY_CONTEXT_BUDGET, extraQuery = ''): string {
  const records = memoryRecordsFor(project)
  const query = normalize([project.outline?.chapters[chapter - 1]?.title, project.outline?.chapters[chapter - 1]?.summary, project.userDirection, extraQuery].filter(Boolean).join(' '))
  const terms = knowledgeTerms(query)
  const index = new Map<string, Set<string>>()
  for (const record of records) {
    for (const token of knowledgeTerms(normalize(`${record.subject} ${record.text} ${record.related.join(' ')}`))) {
      const bucket = index.get(token) || new Set<string>(); bucket.add(record.id); index.set(token, bucket)
    }
  }
  const scores = new Map<string, number>()
  for (const term of terms) for (const id of index.get(term) || []) scores.set(id, (scores.get(id) || 0) + 1)
  const seeds = records.filter((r) => (r.subject && query.includes(normalize(r.subject))) || (scores.get(r.id) || 0) >= 2)
  const seedIds = new Set(seeds.map((r) => r.id))
  const seedNames = new Set(seeds.map((r) => normalize(r.subject)).filter(Boolean))
  const relatedIds = new Set(seeds.flatMap((r) => r.related))
  for (const record of records) {
    if (relatedIds.has(record.id) || record.related.some((id) => seedIds.has(id) || seedNames.has(normalize(id)))) {
      scores.set(record.id, (scores.get(record.id) || 0) + 10)
    }
  }
  const compact = (m: ChapterMemory | undefined) => m ? { chapter: m.chapter, complete: m.complete,
    summary: m.summary.slice(0, 600), events: m.events.slice(-3).map((s) => s.slice(0, 180)), state: m.state.slice(-3).map((s) => s.slice(0, 180)),
    hasUnverifiedUpdates: records.some((r) => r.source.chapter === m.chapter && r.verificationIssue) } : null
  const brief = (r: MemoryRecord) => ({ id: r.id, version: r.version, kind: r.kind, subject: r.subject, text: r.text, status: r.status,
    related: r.related, source: { chapter: r.source.chapter, chunk: r.source.chunk, verified: r.source.verified },
    ...(r.verificationIssue ? { verification: { code: r.verificationIssue.code, proposedStatus: r.verificationIssue.proposedStatus, previousText: r.verificationIssue.previousText } } : {}) })
  const core = records.filter((r) => r.status !== 'resolved' && (r.importance === 'core' || r.kind === 'rule' || r.kind === 'requirement'))
  const context = { coreFacts: core.map(brief), relevantFacts: [] as ReturnType<typeof brief>[],
    previousChapter: compact(project.chapterMemories?.find((m) => m.chapter === chapter - 1 && m.complete)),
    currentChapter: compact(project.chapterMemories?.find((m) => m.chapter === chapter)),
    sourceExcerpts: [] as { id: string; chapter: number; text: string }[],
    coverage: { totalRecords: records.length, selectedRecords: core.length, omittedRecords: records.length - core.length } }
  if (JSON.stringify(context).length > budget) throw new Error('Ràng buộc bắt buộc vượt ngân sách ngữ cảnh; cần rút gọn hoặc tăng ngân sách, không tự bỏ quy luật quan trọng.')
  const factBudget = Math.max(JSON.stringify(context).length, budget - 1200)
  const ranked = records.filter((r) => !core.includes(r)).map((r) => ({ r, score:
    (scores.get(r.id) || 0) + (r.subject && query.includes(normalize(r.subject)) ? 15 : 0) +
    (r.kind === 'thread' && r.status !== 'resolved' ? 8 : 0) + (r.source.chapter >= chapter - 1 ? 3 : 0) - (r.status === 'resolved' ? 10 : 0)
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || b.r.version - a.r.version)
  for (const { r } of ranked) {
    const item = brief(r)
    context.relevantFacts.push(item)
    context.coverage.selectedRecords++; context.coverage.omittedRecords--
    if (JSON.stringify(context).length > factBudget) { context.relevantFacts.pop(); context.coverage.selectedRecords--; context.coverage.omittedRecords++ }
  }
  for (const item of context.relevantFacts.slice(0, 3)) {
    const record = records.find((r) => r.id === item.id)!
    const doc = project.chapterDocuments?.find((d) => d.chapter === record.source.chapter)
    if (!doc) continue
    const excerpt = { id: record.id, chapter: doc.chapter, text: doc.text.slice(Math.max(0, record.source.start - 120), Math.min(doc.text.length, record.source.end + 120)).slice(0, 500) }
    context.sourceExcerpts.push(excerpt)
    if (JSON.stringify(context).length > budget) context.sourceExcerpts.pop()
  }
  // Fall back to actual prose when a fact was never extracted into structured memory.
  if (context.sourceExcerpts.length < 2 && terms.size) {
    const sources = project.chapterDocuments?.length ? project.chapterDocuments : [{ chapter: 0, text: project.generatedStory }]
    const candidates: { chapter: number; text: string; score: number }[] = []
    for (const source of sources) {
      for (const line of source.text.split(/\n+/)) {
        const normalized = normalize(line)
        const matches = [...terms].filter((term) => normalized.includes(term))
        if (matches.length < 2) continue
        const start = Math.max(0, Math.min(...matches.map((term) => normalized.indexOf(term))) - 100)
        candidates.push({ chapter: source.chapter, text: line.slice(start, start + 500), score: matches.length })
      }
    }
    for (const item of candidates.sort((a, b) => b.score - a.score)) {
      if (context.sourceExcerpts.length >= 2) break
      if (context.sourceExcerpts.some((e) => e.text === item.text)) continue
      context.sourceExcerpts.push({ id: `history-chapter-${item.chapter}`, chapter: item.chapter, text: item.text })
      if (JSON.stringify(context).length > budget) context.sourceExcerpts.pop()
    }
  }
  return JSON.stringify(context)
}
