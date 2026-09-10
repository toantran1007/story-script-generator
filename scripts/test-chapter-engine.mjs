import assert from 'node:assert/strict'
import path from 'node:path'
import { harness } from './test-chapter-memory.mjs'

const first = 'Lan đã sửa xong đồng hồ.\nCô cất nó vào túi.'
const wrong = 'Lan sửa lại đồng hồ.\nCô trao nó cho An rồi về nhà.'
const fixed = 'Lan lấy chiếc đồng hồ đã sửa ra.\nCô trao nó cho An rồi về nhà.'
const memory = (text, resolved = false) => ({ chapter: { summary: text, events: [text], state: [], openThreads: [] }, updates: [
  { id: 'clock', kind: 'object', subject: 'đồng hồ', text, status: resolved ? 'resolved' : 'current', importance: 'normal', related: ['Lan', 'An'], evidence: text.split('\n')[0] }
] })
const correction = (text, edits = [], resolved = false) => JSON.stringify({ edits, memory: memory(text, resolved) })
const edit = { before: 'Lan sửa lại đồng hồ.', after: 'Lan lấy chiếc đồng hồ đã sửa ra.' }
let app = harness([first, wrong], [correction(first), correction(fixed, [edit], true)], 'new')
await app.store.getState().confirmAndWrite()
let project = app.store.getState().getActiveProject()
assert.equal(project.status, 'done', app.store.getState().getActiveRuntime().error)
assert.equal(project.generatedStory, `${first}\n\n${fixed}`)
assert.equal(app.calls.length, 2)
assert.equal(app.chatCalls.length, 2, 'one correction+memory request per chapter; no recheck')
assert(app.calls[1][1].content.includes('Lan đã sửa xong đồng hồ.'))
assert.equal(project.memoryRecords[0].version, 2)
assert.equal(project.memoryRecords[0].source.verified, true)
assert.equal(project.memoryRecords[0].status, 'resolved')
assert(app.saved.some((p) => p.pendingChapter?.text === wrong && p.writingMemory.completedChapters === 1))
assert(!project.pendingChapter)
console.log('PASS: whole chapters use exactly writing + targeted correction/memory; next chapter sees committed memory')

for (const heading of ['TIME:', 'PREREQUISITES:', 'COUNTS:', 'KNOWLEDGE:', 'MEMORY:', 'ITEM PROVENANCE:', 'INVENTORY ARITHMETIC:', 'RETURNING GROUPS:', 'ENDING IDENTITY AND CHANGE:']) {
  assert(app.calls[0][0].content.includes(heading), `writing receives ${heading}`)
  assert(app.chatCalls[0][0].content.includes(heading), `single correction receives ${heading}`)
}
for (const heading of ['LOCKED-ABILITY PROGRESSION (conditional):', 'POISON AND SURVIVAL (conditional):', 'NAMED RELIC WORDING (conditional):', 'REDEMPTION ARC (conditional):']) {
  assert(app.calls[0][0].content.includes(heading), `writing receives ${heading}`)
  assert(app.chatCalls[0][0].content.includes(heading), `correction receives ${heading}`)
}
assert(app.chatCalls[0][0].content.includes('Fear, obedience or a single warning is not redemption'))
for (const call of [app.calls[0], app.chatCalls[0]]) {
  assert(call[0].content.includes('Skip irrelevant checks silently'))
  assert(call[0].content.includes('examples below illustrate errors, not story facts or required content'))
  assert(call[0].content.includes('Ordinary plausible object use does not require an acquisition scene'))
  assert(call[0].content.includes('Do not add statistics, exposition, timestamps'))
}
assert(app.chatCalls[0][0].content.includes('a false system announcement cannot validate its own prerequisites'))
assert(app.chatCalls[0][0].content.includes('ten-villager mission can still target ten'))
assert(app.chatCalls[0][0].content.includes('ten portions shared among thirteen people still consume ten'))
assert(app.chatCalls[0][0].content.includes('Do not silently add it to the catalogue'))
assert(app.chatCalls[0][0].content.includes('Treat a missing transition as a clarity issue'))
assert(app.chatCalls[0][0].content.includes('Do not invent age or identity'))
assert.equal(app.chatCalls.length, 2, 'continuity checks add no second audit or extra API call')
console.log('PASS: timeline, prerequisite, scoped-count and knowledge-source rules reach actual writing/correction requests without extra calls')

app = harness([first], [new Error('Correction unavailable')], 'new')
app.store.setState({ projects: [{ ...app.project, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
const pending = structuredClone(app.store.getState().getActiveProject())
assert.equal(pending.pendingChapter.text, first)
assert.equal(pending.generatedStory, '')
assert.equal(pending.writingMemory.completedChapters, 0)
app = harness([], [correction(first)], 'new')
app.store.setState({ projects: [pending], activeProjectId: pending.id })
await app.store.getState().continueWriting()
assert.equal(app.calls.length, 0, 'restart reuses saved draft, never regenerates it')
assert.equal(app.chatCalls.length, 1)
assert.equal(app.store.getState().getActiveProject().generatedStory, first)
assert.equal(app.store.getState().getActiveProject().status, 'done')
console.log('PASS: correction failure retains draft across restart; resume only corrects the saved chapter')

const { applyChapterCorrection } = app.load(path.resolve('src/renderer/src/services/chapterCorrection.ts'))
assert.throws(() => applyChapterCorrection('abc abc', correction(first, [{ before: 'abc', after: 'x' }])), /duy nhất/)
assert.throws(() => applyChapterCorrection('abcdef', correction(first, [{ before: 'abc', after: 'x' }, { before: 'bcd', after: 'y' }])), /chồng/)
assert.throws(() => applyChapterCorrection(first, correction(first, [{ before: 'not present', after: 'x' }])), /duy nhất/)
assert.throws(() => applyChapterCorrection(first, '{broken'))
assert.equal(applyChapterCorrection(first, correction(first)).text, first)
console.log('PASS: local patch checks reject missing, ambiguous and overlapping edits; unchanged prose stays exact')

const { chapterCountFor, chapterBudgetsFor } = app.load(path.resolve('src/renderer/src/services/textMetrics.ts'))
for (const total of [900, 5000, 9000, 27000, 54000, 100000]) {
  const budgets = chapterBudgetsFor(chapterCountFor(total), total)
  assert.equal(budgets.reduce((a, b) => a + b, 0), total)
  if (total >= 8000) assert(budgets.every((value) => value >= 4000 && value <= 6000))
}
let exported
globalThis.window.api.exportStory = async (p) => { exported = p }
app.store.setState({ projects: [{ ...app.store.getState().getActiveProject(), hookText: 'HOOK' }] })
await app.store.getState().exportProject('test', 'txt', false)
assert.equal(exported.hookText, '')
assert.equal(exported.generatedStory, first)
await app.store.getState().exportProject('test', 'txt', true)
assert.equal(exported.hookText, 'HOOK')
console.log('PASS: soft chapter budgets preserve total; prose-only export excludes hook without mutating the project')

app = harness([{ text: 'Lan đã sửa', finishReason: 'length' }, { text: ' xong đồng hồ.', finishReason: 'stop' }], [correction('Lan đã sửa xong đồng hồ.')], 'new')
app.store.setState({ projects: [{ ...app.project, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.store.getState().getActiveProject().generatedStory, 'Lan đã sửa xong đồng hồ.')
assert.equal(app.calls.length, 2)
assert.equal(app.chatCalls.length, 1)
assert(app.calls[1][1].content.includes('DRAFT SO FAR:\nLan đã sửa'))
assert(app.saved.some((p) => p.pendingChapter?.truncated && p.pendingChapter.text === 'Lan đã sửa'))
console.log('PASS: API length truncation persists partial chapter and continues it before the single correction call')

app = harness([first], ['{broken', correction(first)], 'new')
app.store.setState({ projects: [{ ...app.project, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1)
assert.equal(app.chatCalls.length, 2)
assert.equal(app.store.getState().getActiveProject().generatedStory, first)
console.log('PASS: malformed correction response retries its format only; prose is not regenerated or re-audited')

app = harness([first], ['{broken', '{broken', '{broken'], 'new')
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1)
assert.equal(app.chatCalls.length, 3)
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, first)
assert.equal(app.store.getState().getActiveProject().generatedStory, '')
console.log('PASS: invalid correction stops after three attempts with the draft intact')

app = harness([first], ['', correction(first)], 'new')
await app.store.getState().confirmAndWrite()
assert.equal(app.chatCalls.length, 1, 'empty correction stops without repeating the same request')
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, first)
assert.match(app.store.getState().getActiveRuntime().error, /API_EMPTY_CONTENT/)
assert.equal(app.store.getState().getActiveProject().generatedStory, '')
console.log('PASS: empty correction retains draft and stops at one API call')

const { evidenceSentences } = app.load(path.resolve('src/renderer/src/services/sentenceEvidence.ts'))
const { applyMemoryPayload } = app.load(path.resolve('src/renderer/src/services/detailedMemory.ts'))
const sourceDraft = 'Lan đứng dậy.\nNước đã sạch.\nNước đã sạch.'
const sourceMemory = (sourceId) => ({ chapter: { summary: 'Water.', events: [], state: [], openThreads: [] }, updates: [{
  id: 'water', kind: 'fact', subject: 'water', text: 'Water is clean.', status: 'current', importance: 'normal', related: [], evidenceSentenceId: sourceId
}] })
const sourceResult = (draft, id, edits = []) => applyChapterCorrection(draft, JSON.stringify({ edits, memory: sourceMemory(id) }))
let located = sourceResult(sourceDraft, 'S3', [{ before: 'Lan đứng dậy.', after: 'Lan chậm rãi đứng dậy.' }])
let patch = applyMemoryPayload(app.project, 1, 0, true, located.text, located.memory)
assert.equal(patch.memoryRecords[0].source.verified, true)
assert.equal(patch.memoryRecords[0].source.start, located.text.lastIndexOf('Nước đã sạch.'))
assert.equal(patch.memoryRecords[0].source.quote, 'Nước đã sạch.')
located = sourceResult('Nước bẩn.\nLan uống.', 'S1', [{ before: 'Nước bẩn.', after: 'Nước đã sạch.' }])
assert.equal(located.memory.updates[0].evidence, 'Nước đã sạch.')
assert.equal(located.memory.evidenceRanges.water.start, 0)
for (const [draft, id, edits] of [
  [sourceDraft, 'S999', []],
  ['Nước bẩn.\nLan uống.', 'S1', [{ before: 'Nước bẩn.', after: '' }]],
  ['Nước bẩn.\nLan uống.', 'S1', [{ before: 'Nước bẩn.\nLan uống.', after: 'Lan chờ.' }]]
]) {
  located = sourceResult(draft, id, edits)
  patch = applyMemoryPayload(app.project, 1, 0, true, located.text, located.memory)
  assert.equal(patch.memoryRecords[0].status, 'unknown')
  assert.equal(patch.memoryRecords[0].source.verified, false)
  assert.equal(patch.memoryIssues.length, 1)
}
for (const draft of ['「水だ。」\r\n水はきれいだ。', '  Water is clean. Next sentence.\nDone.']) {
  for (const sentence of evidenceSentences(draft)) assert.equal(draft.slice(sentence.start, sentence.end), sentence.text)
}
app = harness([first], [JSON.stringify({ edits: [], memory: sourceMemory('S1') })], 'new')
app.store.setState({ projects: [{ ...app.project, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.chatCalls.length, 1)
assert(app.chatCalls[0][1].content.includes('ORIGINAL SENTENCE IDS'))
assert.equal(app.store.getState().getActiveProject().memoryRecords[0].source.verified, true)
assert(!app.store.getState().getActiveProject().generatedStory.includes('"id":"S1"'))
console.log('PASS: sentence IDs resolve duplicate/edited sources locally; deleted/cross-sentence/unknown sources remain uncertain, no extra API or prose metadata')

const { chapterOutputBudget } = app.load(path.resolve('src/renderer/src/services/textMetrics.ts'))
assert.equal(chapterOutputBudget('ja', 3500).maxTokens, 6274)
assert.equal(chapterOutputBudget('ja', 3500, 2959).remainingChars, 541)
assert(chapterOutputBudget('ja', 3500, 2959).maxTokens >= 2048)
assert(chapterOutputBudget('ja', 3500).maxTokens > chapterOutputBudget('en', 3500).maxTokens)
assert.equal(chapterOutputBudget('ja', 3500, 4000).remainingChars, 0)
assert(chapterOutputBudget('ja', 3500, 4000).maxTokens >= 2048)
assert.equal(chapterOutputBudget('custom', 100000).maxTokens, 16384)
app = harness([{ text: '水が', finishReason: 'length' }, { text: '流れた。', finishReason: 'stop' }], [JSON.stringify({ edits: [], memory: sourceMemory('S1') })], 'new')
app.store.setState({ projects: [{ ...app.project, language: 'ja', duration: 10, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.streamOptions[0].maxTokens, 6274)
assert.equal(app.streamOptions[1].maxTokens, chapterOutputBudget('ja', 3500, 2).maxTokens)
assert(app.calls[1][1].content.includes('3498 characters remain'))
assert.equal(app.store.getState().getActiveProject().generatedStory, '水が流れた。')
assert.equal(app.chatCalls.length, 1)
console.log('PASS: Japanese writing and continuation receive language-aware remaining budgets; drafts survive and correction runs once')
