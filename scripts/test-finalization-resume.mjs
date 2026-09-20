import { proseFixture } from './lib/prose-fixture.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createLoader } from './lib/load-local-ts.mjs'
import { harness } from './test-chapter-memory.mjs'
const load = createLoader()
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { revisionKey, planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { exportStoryJSON } = load('src/shared/storyExport.ts')
function completed(text) {
  const p = { ...createEmptyProject('final-retry', 'Final retry'), language: 'custom', customLanguage: 'Русский', duration: 5, enableHook: false, status: 'writing', outlinePhase: 'writing', generatedStory: text,
    durationIssue: 'Tổng độ dài/thời lượng AI ngắn hơn 15% mục tiêu',
    outline: { title: 'Story', outlineSummary: 'End', chapters: [{ chapter: 1, title: 'End', summary: 'End', estimatedWords: 400 }] },
    chapterDocuments: [{ chapter: 1, text, complete: true, chunks: [{ chunk: 0, start: 0, end: text.length }] }] }
  p.longStory = { version: 1, cursor: 1, stage: 'accepted', attempt: 0, checkpoints: [], accepted: [{ chapter: 1, revision: revisionKey(text), estimatedMinutes: 4 }],
    plan: { version: 1, inputKey: planInputKey(p), outline: p.outline, canon: ['End'], duration: { requestedMinutes: 5, estimatedMinutes: 5, targetCharacters: 1800, rationale: 'Russian pacing', source: 'ai-estimate' }, chapters: [{ chapter: 1, targetCharacters: 1800, estimatedMinutes: 5, beats: ['A', 'B'], ending: 'End' }] } }
  return p
}
async function finish(p) {
  let result = structuredClone(p), calls = 0
  const ports = { read: () => result, stopped: () => false, progress: () => {}, save: async patch => { result = { ...result, ...patch } }, chat: async () => { calls++; throw Error('must not call API') }, stream: async () => { calls++; throw Error('must not call API') } }
  await runLongStory(ports)
  assert.equal(calls, 0)
  assert.equal(result.status, 'done')
  assert.equal(result.durationIssue, null)
  assert.equal(result.generatedStory, p.generatedStory)
  assert.deepEqual(result.chapterDocuments, p.chapterDocuments)
  assert.equal(result.longStory.plan.duration.actualEstimateSource, 'ai-plan-ratio')
  assert.equal(JSON.parse(exportStoryJSON(result)).durationSource, 'ai-plan-ratio')
  return result
}
await finish(completed(proseFixture(2640)))
await assert.rejects(finish(completed(proseFixture(500))), /chưa đạt mức tối thiểu/)
const app = harness([], [], 'new')
const persisted = completed(proseFixture(2640))
app.store.setState({ projects: [persisted], activeProjectId: persisted.id, runtimes: {} })
await app.store.getState().retryLastAction()
assert.equal(app.store.getState().getActiveProject().status, 'done', 'Retry infers the persisted stage when lastAction was lost on restart')
assert.equal(app.chatCalls.length, 0)
assert.equal(app.calls.length, 0)
console.log('PASS: custom-language finalization, genuinely short rejection, persisted Retry routing, no generation and unchanged prose')
if (process.argv.includes('--projects')) {
  const results = []
  for (const entry of fs.readdirSync('data/projects')) {
    const file = path.join('data/projects', entry, 'project.json')
    if (!fs.existsSync(file)) continue
    const bytes = fs.readFileSync(file), p = JSON.parse(bytes).project
    if (!['test 3', 'test 5'].includes(p.name)) continue
    const done = await finish(p)
    const timing = estimateWrittenDuration(done)
    assert.deepEqual(fs.readFileSync(file), bytes, 'verification must not write user projects')
    results.push({ name: p.name, oldAiMinutes: p.longStory.accepted.reduce((n,c)=>n+c.estimatedMinutes,0), requestedMinutes: p.duration, characters: timing.characters,
      estimatedMinutes: Math.round(timing.minutes * 10)/10, source: timing.source, resumedCloneStatus: done.status, originalUnchanged: true, apiCalls: 0 })
  }
  assert.equal(results.length, 2)
  console.log(JSON.stringify(results, null, 2))
}
