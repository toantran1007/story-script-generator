import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { findTextRepetitions, assertNoTextRepetition } = load('src/shared/textRepetition.ts')
const { narrationChars } = load('src/renderer/src/services/textMetrics.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { applyChapterCorrection, correctionRetryFeedback } = load('src/renderer/src/services/chapterCorrection.ts')
const { assertNativeReviewGate } = load('src/renderer/src/services/nativeReviewGate.ts')
const { exportStoryJSON } = load('src/shared/storyExport.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { chapterReadiness } = load('src/renderer/src/services/longStory/recoveryPolicy.ts')
const { plainNarration } = load('src/shared/plainNarration.ts')
export const start = '太郎は倉庫の鍵を棚に戻した。花は戸締まりを確認した。二人は帰り道で夕焼けを見上げた。\n'
export const end = '\n花は笑顔で手を振った。太郎は家に帰り、夕食を食べてから静かに本を読んだ。'
export const bad = start + '「う' + 'お'.repeat(8587) + '！」' + end
export const good = plainNarration(start + '「うおお！」' + end)
export const report = { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }
export const packet = (edits = []) => JSON.stringify({ edits, languageReview: report, review: { passed: true, issues: [], estimatedMinutes: .05, beatsComplete: true, missingBeats: [] }, memory: { chapter: { summary: '鍵を戻して家に帰った。', events: [], state: [], openThreads: [] }, updates: [{ id: 'key', kind: 'object', subject: '鍵', text: '鍵を棚に戻した。', status: 'current', importance: 'normal', related: [], evidenceSentenceId: 'S1' }] } })
for (const text of [bad, 'ก'.repeat(1000), '😀'.repeat(500), 'お '.repeat(200), '勝った！'.repeat(300), 'A paragraph that should not endlessly repeat.\n'.repeat(30)]) {
  assert(findTextRepetitions(text).length)
  assert.throws(() => assertNoTextRepetition(text), /lặp bất thường/)
}
for (const text of ['おおおおお！', 'ピピピピピピピピ！', '55555', 'ฮ่าๆๆๆ', '!!!!!!', '……', good]) assert.equal(findTextRepetitions(text).length, 0)
assert.equal(findTextRepetitions(bad)[0].repeats, 8587)
assert.equal(narrationChars(bad, 'ja'), narrationChars(start + '「う！」' + end, 'ja'))
assert.equal(estimateWrittenDuration({ language: 'ja', generatedStory: bad }).minutes, null)
assert.throws(() => exportStoryJSON({ language: 'ja', generatedStory: bad }), /lặp/)
assert.throws(() => applyChapterCorrection(bad, packet()), /lặp/)
assert.throws(() => assertNativeReviewGate(JSON.stringify({ language: 'ja', complete: true, chapterReview: { complete: true, noRepeatedCompletion: true, noPrematureCompletion: true, knowledgeConsistent: true }, issues: [], unresolved: [] }), { language: 'ja' }, bad), /lặp/)
assert.equal(applyChapterCorrection(bad, packet([{ before: '「う' + 'お'.repeat(8587) + '！」', after: '「うおお！」' }])).text, good)
assert.equal(applyChapterCorrection(bad, packet([{ repetitionId: 'R1', after: 'おお' }])).text, good)
assert.throws(() => applyChapterCorrection(bad, packet([{ repetitionId: 'R99', after: 'お' }])), /không hợp lệ/)
assert.throws(() => applyChapterCorrection(bad, packet([{ repetitionId: 'R1', before: 'x', after: 'お' }])), /không hợp lệ/)
assert.throws(() => applyChapterCorrection(bad, packet([{ repetitionId: 'R1', after: 'お' }, { repetitionId: 'R1', after: 'お' }])), /chồng/)

async function scenario(alwaysBad, savedDraft = false) {
  let p = { ...createEmptyProject('repeat-' + alwaysBad + savedDraft, 'Repetition test'), language: 'ja', duration: .05, enableHook: false, idea: 'Return a key and go home.' }
  p.outline = { title: 'T', outlineSummary: p.idea, chapters: [{ chapter: 1, title: 'T', summary: p.idea }] }
  p.longStory = { version: 1, cursor: 0, stage: savedDraft ? 'review' : 'write', draft: savedDraft ? bad : undefined, attempt: 0, accepted: [], checkpoints: [], plan: { version: 1, inputKey: planInputKey(p), outline: p.outline, canon: ['Return key'], duration: { requestedMinutes: .05, targetCharacters: 30, estimatedMinutes: .05 }, chapters: [{ chapter: 1, targetCharacters: 30, estimatedMinutes: .05, beats: ['Return key','Go home'], ending: 'Home' }] } }
  assert.equal(chapterReadiness(p, bad).valid, false)
  let writes = 0, corrections = 0, gates = 0
  const promise = runLongStory({ read: () => p, stopped: () => false, progress: () => {}, chat: async () => { throw Error('unexpected') }, save: async patch => { p = structuredClone({ ...p, ...patch }); assert(!findTextRepetitions(p.generatedStory).length) }, stream: async (messages, emit) => {
    if (messages[0].content.startsWith('Write literary')) { writes++; emit(bad); return { text: bad, finishReason: 'stop' } }
    if (messages[0].content.startsWith('INDEPENDENT')) { gates++; return { text: JSON.stringify({ language: 'ja', complete: true, chapterReview: { complete: true, noRepeatedCompletion: true, noPrematureCompletion: true, knowledgeConsistent: true }, issues: [], unresolved: [] }), finishReason: 'stop' } }
    corrections++
    if (corrections > 1) assert(messages[1].content.includes('repetition'))
    return { text: alwaysBad || corrections === 1 ? packet() : packet([{ before: '「う' + 'お'.repeat(8587) + '！」', after: '「うおお！」' }]), finishReason: 'stop' }
  } })
  if (alwaysBad) { await assert.rejects(promise); assert.equal(p.generatedStory, ''); assert.equal(p.longStory.draft, bad); assert.equal(p.memoryRecords.length, 0); assert.equal(corrections, 9); assert.equal(gates, 0) }
  else { await promise; assert.equal(p.generatedStory, good); assert.equal(corrections, 2); assert.equal(gates, 1); assert.equal(p.longStory.stage, 'done') }
  assert.equal(writes, savedDraft ? 0 : 1)
}
await scenario(false)
await scenario(true)
await scenario(false, true)
const f = 'data/projects/08449e0f-3ac2-4a58-bbe8-76cd36176eb3/project.json'
if (fs.existsSync(f)) {
  const bytes = fs.readFileSync(f), p = JSON.parse(bytes).project
  assert(findTextRepetitions(p.chapterDocuments[4].text).some(s => s.repeats === 8587))
  await assert.rejects(runLongStory({ read: () => p, stopped: () => false }), /lặp/)
  assert.equal(estimateWrittenDuration(p).minutes, null)
  assert(bytes.equals(fs.readFileSync(f)))
}
console.log('PASS: exact 19-1 corruption, Unicode/phrase repeats, valid shouts, false AI pass, recovery/exhaustion, saved draft, finalization/export and duration; original untouched')
