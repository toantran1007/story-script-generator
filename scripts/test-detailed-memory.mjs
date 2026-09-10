import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const root = path.resolve('src/renderer/src'), cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (!id.startsWith('@/')) return require(id)
    const target = path.join(root, id.slice(2))
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
  })
  return module.exports
}
const { createEmptyProject } = load(path.join(root, 'types/index.ts'))
const { parseWritingResponse, MEMORY_MARKER } = load(path.join(root, 'services/chapterMemory.ts'))
const { applyMemoryPayload, selectMemoryContext } = load(path.join(root, 'services/detailedMemory.ts'))
const delta = (id, subject, text, evidence, extra = {}) => ({ id, subject, text, evidence, kind: 'object', status: 'current', importance: 'normal', related: ['Lan', 'An'], ...extra })
const payload = (updates, events = []) => ({ chapter: { summary: 'Current chapter.', events, state: [], openThreads: [] }, updates })
let project = { ...createEmptyProject('test', 'Test'), outline: { title: 'Clock', outlineSummary: 'Repair and return.', chapters: Array.from({ length: 20 }, (_, index) => ({ chapter: index + 1, title: 'An và đồng hồ', summary: 'An kiểm tra đồng hồ.', estimatedWords: 1000 })) } }
const text1 = 'Đồng hồ chỉ sửa được bằng tay. Lan sửa đồng hồ. Cô hứa trả nó cho An.'
const first = payload([
  delta('clock-rule', 'Quy luật đồng hồ', 'Không dùng phép để sửa đồng hồ.', 'Đồng hồ chỉ sửa được bằng tay.', { kind: 'rule', importance: 'core' }),
  delta('clock-owner', 'đồng hồ', 'Lan giữ đồng hồ đã sửa.', 'Lan sửa đồng hồ.'),
  delta('return-task', 'việc trả đồ', 'Phải trả lại đồng hồ cho An.', 'Cô hứa trả nó cho An.', { kind: 'thread' })
], ['Lan repaired the clock.'])
const raw = `${text1}\n${MEMORY_MARKER}\n${JSON.stringify(first)}`
const decoded = parseWritingResponse(raw)
project = { ...project, ...applyMemoryPayload(project, 1, 0, true, text1, decoded.memory) }
assert.equal(project.chapterDocuments[0].text, text1)
assert.equal(project.memoryRecords.length, 3)
assert.equal(project.memoryPackets[0].payload.chapter.summary, 'Current chapter.')
assert.equal(project.memoryRecords[0].source.quote, 'Đồng hồ chỉ sửa được bằng tay.')
assert.equal(project.chapterDocuments[0].text.slice(project.memoryRecords[0].source.start, project.memoryRecords[0].source.end), project.memoryRecords[0].source.quote)

const text2 = 'Lan trao đồng hồ cho An. Cô trở về nhà.'
project = { ...project, ...applyMemoryPayload(project, 2, 0, true, text2, payload([
  delta('clock-owner', 'đồng hồ', 'An giữ đồng hồ đã sửa.', 'Lan trao đồng hồ cho An.'),
  delta('return-task', 'việc trả đồ', 'Đã trả đồng hồ cho An.', 'Lan trao đồng hồ cho An.', { kind: 'thread', status: 'resolved' })
])) }
assert.equal(project.memoryRecords.find((r) => r.id === 'clock-owner').version, 2)
assert(project.memoryHistory.some((h) => h.before?.text === 'Lan giữ đồng hồ đã sửa.' && h.after.text === 'An giữ đồng hồ đã sửa.'))
assert(!project.storyMemory.openThreads.includes('Phải trả lại đồng hồ cho An.'))
assert.equal(project.chapterDocuments.length, 2)
assert.throws(() => applyMemoryPayload(project, 2, 0, true, text2, payload([])), /đã lưu/)
const warned = applyMemoryPayload(project, 3, 0, false, text2, payload([delta('bad', 'x', 'invented', 'This never happened.')]))
assert.equal(warned.memoryRecords.find((r) => r.id === 'bad').status, 'unknown')
assert.equal(warned.memoryIssues[0].suppliedEvidence, 'This never happened.')
assert.equal(warned.chapterDocuments.find((d) => d.chapter === 3).text, text2)
assert.throws(() => applyMemoryPayload(project, 3, 0, false, text2, payload([delta('clock-owner', 'x', 'x', text2, { kind: 'rule' })])), /đổi loại/)
console.log('PASS: keyed deltas update current state, close obligations, preserve previous versions and exact source offsets without duplicating chunks')

const historyLength = project.memoryHistory.length
const recordsBefore = JSON.stringify(project.memoryRecords)
applyMemoryPayload(project, 3, 0, false, text2, payload([delta('x', 'x', 'x', text2)]))
assert.equal(JSON.stringify(project.memoryRecords), recordsBefore)
assert.equal(project.memoryHistory.length, historyLength, 'failed/uncommitted updates cannot mutate original snapshots')

const filler = Array.from({ length: 500 }, (_, index) => ({ ...project.memoryRecords[1], id: `other-${index}`, subject: `unrelated-${index}`, text: 'Background information. '.repeat(8), related: [], source: { ...project.memoryRecords[1].source, chapter: 19 } }))
project = { ...project, memoryRecords: [...project.memoryRecords, { ...project.memoryRecords[1], id: 'seal-condition', subject: 'seal', text: 'The seal must remain intact.', related: ['clock-owner'] }, ...filler] }
const contextText = selectMemoryContext(project, 20)
const context = JSON.parse(contextText)
assert(contextText.length <= 10000)
assert(context.coreFacts.some((r) => r.id === 'clock-rule'), 'early-chapter global rule survives regardless of recency')
assert(context.relevantFacts.some((r) => r.id === 'clock-owner' && r.text === 'An giữ đồng hồ đã sửa.'), 'relevant current owner selected rather than obsolete history')
assert(context.relevantFacts.some((r) => r.id === 'seal-condition'), 'linked records are retrieved even without direct query wording')
assert(context.sourceExcerpts.every((e) => project.chapterDocuments.some((d) => d.chapter === e.chapter && d.text.includes(e.text))))
assert(context.sourceExcerpts.some((e) => e.id === 'clock-owner'), 'budget reserves room for source evidence of selected old facts')
assert(context.coverage.omittedRecords > 0)
assert(!context.relevantFacts.some((r) => r.text === 'Lan giữ đồng hồ đã sửa.'))
const fullSize = JSON.stringify(project.memoryRecords).length
assert(contextText.length < fullSize / 5)
assert.throws(() => selectMemoryContext({ ...project, memoryRecords: [{ ...project.memoryRecords[0], text: 'x'.repeat(11000) }] }, 20), /Ràng buộc bắt buộc/)
console.log(`PASS: local selection keeps early constraints and relevant state: ${fullSize} stored characters -> ${contextText.length} context characters; no external search call`)

const large = payload([delta('big-rule', 'rule', 'x'.repeat(4000), text2, { kind: 'rule', importance: 'core' })])
large.chapter.summary = 's'.repeat(2500)
assert(parseWritingResponse(`${text2}\n${MEMORY_MARKER}\n${JSON.stringify(large)}`).memory.updates.length === 1, 'old 2000/3500 total-memory caps no longer apply')
assert.throws(() => parseWritingResponse(`${text2}\n${MEMORY_MARKER}\n${JSON.stringify(payload([large.updates[0], large.updates[0]]))}`))
assert.throws(() => parseWritingResponse(`${text2}\n${MEMORY_MARKER}\n${JSON.stringify(payload([delta('bad', 'x', 'x', '', {})]))}`))
console.log('PASS: detailed memory can exceed the former small caps; transport, duplicate-id and evidence-shape safeguards remain')
const omittedFact = { ...createEmptyProject('old', 'Old'), chapterDocuments: [{ chapter: 1, text: 'Chiếc nhẫn xanh chỉ mở cửa khi gặp ánh trăng.', complete: true, chunks: [] }],
  outline: { title: '', outlineSummary: '', chapters: [{ chapter: 1, title: 'Chiếc nhẫn xanh', summary: 'An dùng chiếc nhẫn xanh ở cửa.', estimatedWords: 100 }] } }
const fallback = JSON.parse(selectMemoryContext(omittedFact, 1))
assert(fallback.sourceExcerpts.some((e) => e.text.includes('ánh trăng')))
assert.equal(fallback.coreFacts.length, 0, 'a prose excerpt is evidence, not an invented authoritative fact')
console.log('PASS: local prose search retrieves source evidence even when AI omitted a structured memory fact')

let uncertain = { ...project, ...applyMemoryPayload(project, 3, 0, false, 'An đang chờ ngoài cửa.', payload([
  delta('clock-owner', 'đồng hồ', 'Một người lạ đã lấy đồng hồ.', 'Một người lạ cướp nó.'),
  delta('return-task', 'việc trả đồ', 'Đã hoàn thành việc trả đồ.', 'Nhiệm vụ hoàn tất.', { kind: 'thread', status: 'resolved' }),
  delta('safe-new', 'An', 'An chờ ở cửa.', 'An đang chờ ngoài cửa.', { kind: 'character' })
])) }
const unknownOwner = uncertain.memoryRecords.find((r) => r.id === 'clock-owner')
assert.equal(unknownOwner.status, 'unknown')
assert.equal(unknownOwner.source.verified, false)
assert.equal(unknownOwner.source.quote, '', 'do not fabricate a matched source quote')
assert.equal(unknownOwner.verificationIssue.previousText, 'An giữ đồng hồ đã sửa.')
assert(!uncertain.storyMemory.facts.includes('An giữ đồng hồ đã sửa.'), 'superseded old state is not kept as current')
assert(!uncertain.storyMemory.facts.includes('Một người lạ đã lấy đồng hồ.'), 'unverified proposed state is not promoted')
assert(uncertain.storyMemory.openThreads.some((text) => text.startsWith('[Chưa xác thực]')), 'unverified closure is not treated as a resolved task')
assert.equal(uncertain.memoryRecords.find((r) => r.id === 'safe-new').source.verified, true)
const uncertainContext = JSON.parse(selectMemoryContext(uncertain, 3))
assert(uncertainContext.relevantFacts.some((r) => r.id === 'clock-owner' && r.status === 'unknown' && r.verification.code === 'not_found'))
assert.equal(uncertainContext.currentChapter.hasUnverifiedUpdates, true)
const fixed = applyMemoryPayload(uncertain, 3, 1, true, 'An cất đồng hồ vào túi.', payload([
  delta('clock-owner', 'đồng hồ', 'Đồng hồ nằm trong túi An.', 'An cất đồng hồ vào túi.')
]))
assert.equal(fixed.memoryRecords.find((r) => r.id === 'clock-owner').status, 'current')
assert.equal(fixed.memoryRecords.find((r) => r.id === 'clock-owner').verificationIssue, undefined)
assert.equal(fixed.memoryIssues.length, uncertain.memoryIssues.length, 'previous warnings remain available as local history')
assert.equal(fixed.memoryHistory.at(-1).before.status, 'unknown')
console.log('PASS: mixed evidence preserves prose, valid updates and history; uncertain state replaces stale certainty; later verified updates recover cleanly')

const quotes = applyMemoryPayload(createEmptyProject('quotes', 'Quotes'), 1, 0, true, 'Cậu đáp.\n“Đi thôi!”', payload([
  delta('quote', 'Cậu', 'Cậu nói đi thôi.', '"Đi thôi!"', { kind: 'event' })
]))
assert.equal(quotes.memoryRecords[0].source.quote, '“Đi thôi!”')
assert.equal(quotes.memoryRecords[0].source.verified, true, 'only typography/whitespace normalization is accepted')
const ambiguous = applyMemoryPayload(createEmptyProject('repeat', 'Repeat'), 1, 0, true, 'Lan đứng lại. Lan đứng lại.', payload([
  delta('repeat', 'Lan', 'Lan đứng lại.', 'Lan đứng lại.', { kind: 'event' })
]))
assert.equal(ambiguous.memoryRecords[0].status, 'unknown')
assert.equal(ambiguous.memoryIssues[0].code, 'ambiguous')
const notFuzzy = applyMemoryPayload(createEmptyProject('accent', 'Accent'), 1, 0, true, 'Thảo đứng lại.', payload([
  delta('accent', 'Thảo', 'Thảo đứng lại.', 'Thao đứng lại.', { kind: 'event' })
]))
assert.equal(notFuzzy.memoryRecords[0].source.verified, false, 'names/accents are never fuzzy-matched as verified')
console.log('PASS: quote style differences retain real offsets; ambiguous, paraphrased and accent-mismatched evidence stays unverified')
