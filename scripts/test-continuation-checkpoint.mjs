import { nativeGateResponse } from './lib/native-gate-fixture.mjs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const draft = 'Lan put the only brass key carefully into a small wooden box.'
const tail = '\nShe closed the lid and went home quietly.'
let p = { ...createEmptyProject('checkpoint', 'Checkpoint'), language: 'en', duration: 0.25, enableHook: false }
p.longStory = { version: 1, cursor: 0, stage: 'write', attempt: 0, draft, truncated: true, accepted: [], checkpoints: [], plan: {
  version: 1, inputKey: planInputKey(p), canon: ['One key'], duration: { requestedMinutes: 0.25, estimatedMinutes: 0.25, targetCharacters: 100 },
  outline: { chapters: [{ chapter: 1, title: 'Return', summary: 'Return the key.' }] }, chapters: [{ chapter: 1, targetCharacters: 100, estimatedMinutes: 1, beats: ['Put key in box', 'Go home'], ending: 'Home.' }] } }
let stopped = false, calls = 0
const ports = { read: () => p, stopped: () => stopped, progress: () => {}, chat: async () => { throw Error('unexpected chat') },
  save: async patch => { p = structuredClone({ ...p, ...patch }) },
  stream: async (_messages, emit) => { calls++; emit(draft + tail.slice(0, 25)); stopped = true; throw Error('user stopped') } }
await assert.rejects(runLongStory(ports), /user stopped/)
assert.equal(p.longStory.draft, draft, 'interrupted response must not pollute the immutable base')
assert.equal(p.longStory.continuationBuffer.text, draft + tail.slice(0, 25))
stopped = false
ports.stream = async (messages, emit) => {
  const gate = nativeGateResponse(messages); if (gate) return gate
  calls++
  if (calls === 2) {
    assert.equal(JSON.parse(messages[1].content).draft, draft + tail.slice(0, 25))
    emit(tail.slice(25)); return { text: tail.slice(25), finishReason: 'stop' }
  }
  return { text: JSON.stringify({ edits: [], review: { passed: true, issues: [], estimatedMinutes: 1 }, languageReview: { language: 'en', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }, memory: { chapter: { summary: 'Returned key.', events: [], state: [], openThreads: [] }, updates: [{ id: 'key', kind: 'object', subject: 'key', text: 'Key in box.', status: 'current', importance: 'normal', related: [], evidenceSentenceId: 'S1' }] } }), finishReason: 'stop' }
}
await runLongStory(ports)
assert.equal(p.status, 'done')
assert.equal(p.generatedStory, draft + tail)
assert.equal(p.longStory.continuationBuffer, undefined)
assert.equal(p.chapterDocuments.length, 1)
console.log('PASS: interrupted full echo stays isolated; reload merges once, preserves word boundary and commits one chapter')
