import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
import { harness } from './test-chapter-memory.mjs'
import { proofreadingCases, correctionPacket } from './lib/proofreading-cases.mjs'
const load = createLoader()
const { assertNativeReviewGate, nativeReviewMessages } = load('src/renderer/src/services/nativeReviewGate.ts')
const test = proofreadingCases[0]
const ok = { language: 'ja', complete: true, chapterReview: { complete: true, noRepeatedCompletion: true, noPrematureCompletion: true, knowledgeConsistent: true }, issues: [], unresolved: [] }
const candidate = test.edits.reduce((s, e) => s.replace(e.before, e.after), test.draft)
for (const value of [null, {}, { ...ok, complete: false }, { ...ok, language: 'th' }, { ...ok, unresolved: ['ambiguous role'] }, { ...ok, issues: [{ quote: 'missing', suggestion: 'x', reason: 'bad source' }] }]) {
  assert.throws(() => assertNativeReviewGate(JSON.stringify(value), { language: 'ja' }, candidate))
}
assert.throws(() => assertNativeReviewGate('broken', { language: 'ja' }, candidate))
assert.doesNotThrow(() => assertNativeReviewGate(JSON.stringify(ok), { language: 'ja' }, candidate))
const issue = { ...ok, issues: [{ quote: test.edits[0].before, suggestion: test.edits[0].after, reason: 'Title of a swordsman, not a tactical action' }] }
assert.throws(() => assertNativeReviewGate(JSON.stringify(issue), { language: 'ja' }, test.draft), /Independent editor findings/)
function setup(chats, gates) {
  const app = harness([test.draft], chats, 'new', false, false, gates)
  app.store.setState({ projects: [{ ...app.project, language: 'ja', idea: test.premise, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
  return app
}
const incorrect = JSON.stringify(correctionPacket(test, { edits: [] }))
const correct = JSON.stringify(correctionPacket(test))
let app = setup([incorrect, correct], [JSON.stringify(issue), JSON.stringify(ok)])
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1, 'gate retry never regenerates prose')
assert.equal(app.chatCalls.length, 2); assert.equal(app.gateCalls.length, 2)
assert(app.chatCalls[1][1].content.includes('Title of a swordsman'))
assert.equal(app.store.getState().getActiveProject().generatedStory, candidate)
assert(!app.saved.some(p => p.generatedStory === test.draft), 'failed candidate never committed')
app = setup(Array(3).fill(incorrect), Array(3).fill(JSON.stringify(issue)))
await app.store.getState().confirmAndWrite()
assert.equal(app.store.getState().getActiveProject().generatedStory, '')
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, test.draft)
assert.equal(app.gateCalls.length, 3)
assert.equal(app.store.getState().getActiveProject().memoryRecords.length, 0)
// Simulate cancellation while the independent request is in flight.
app = setup([correct], [async () => { app.store.getState().stopGeneration(); return JSON.stringify(ok) }])
await app.store.getState().confirmAndWrite()
assert.equal(app.store.getState().getActiveProject().generatedStory, '')
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, test.draft)
assert.equal(app.gateCalls.length, 1, 'cancellation does not become a format-retry loop')
const gateInput = nativeReviewMessages({ language: 'ja', ideaInputType: 'idea', idea: test.premise, chapterDocuments: [] }, 1, { text: candidate, original: test.draft, edits: test.edits })
assert.equal(JSON.parse(gateInput[1].content).originalDraft, test.draft)
assert.deepEqual(JSON.parse(gateInput[1].content).proposedEdits, test.edits)
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
async function longGateCase(alwaysReject, cancelAtGate = false) {
  let p = { ...createEmptyProject('gate-long', 'Gate'), language: 'ja', idea: test.premise, duration: .05, enableHook: false }
  p.outline = { title: 'T', outlineSummary: test.premise, chapters: [{ chapter: 1, title: 'T', summary: test.premise }] }
  p.longStory = { version: 1, cursor: 0, stage: 'review', attempt: 0, draft: test.draft, accepted: [], checkpoints: [],
    plan: { version: 1, inputKey: planInputKey(p), outline: p.outline, canon: [test.premise], duration: { requestedMinutes: .05, estimatedMinutes: .05, targetCharacters: 25 },
      chapters: [{ chapter: 1, targetCharacters: 25, estimatedMinutes: .05, beats: ['Introduce swordsman', 'Heal guard'], ending: 'Healed' }] } }
  let corrections = 0, gates = 0, stopped = false
  const run = runLongStory({ read: () => p, stopped: () => stopped, progress: () => {}, chat: async () => { throw Error('unexpected') },
    save: async patch => { p = structuredClone({ ...p, ...patch }); assert.notEqual(p.generatedStory, test.draft) },
    stream: async messages => {
      if (messages[0].content.startsWith('INDEPENDENT LANGUAGE GATE:')) {
        gates++; stopped = cancelAtGate
        return { text: alwaysReject || gates === 1 ? JSON.stringify(issue) : JSON.stringify(ok), finishReason: 'stop' }
      }
      corrections++
      assert(messages[0].content.startsWith('Check the supplied chapter'), 'never fall back to rewriting for language-gate failure')
      const body = JSON.parse(messages[1].content)
      assert.equal(body.draft, test.draft)
      if (corrections > 1) assert(body.feedback.includes('Independent editor findings'))
      return { text: alwaysReject || corrections === 1 ? incorrect : correct, finishReason: 'stop' }
    } })
  if (alwaysReject || cancelAtGate) {
    await assert.rejects(run)
    assert.equal(p.generatedStory, ''); assert.equal(p.longStory.draft, test.draft)
    assert.equal(p.memoryRecords.length, 0)
    assert.equal(gates, cancelAtGate ? 1 : 9, 'existing bounded recovery budget, no infinite gate loop')
  } else {
    await run; assert.equal(p.generatedStory, candidate); assert.equal(gates, 2); assert.equal(corrections, 2)
  }
}
await longGateCase(false)
await longGateCase(true)
await longGateCase(false, true)
console.log('PASS: independent gate validates exact findings, retries original draft, blocks prose/memory on exhaustion and cancellation')
