import { proseFixture } from './lib/prose-fixture.mjs'
import { nativeGateResponse } from './lib/native-gate-fixture.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { planInputKey, revisionKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { chapterReadiness, classifyFailure, waitForRecovery } = load('src/renderer/src/services/longStory/recoveryPolicy.ts')
const { modelFallback } = load('src/renderer/src/services/longStory/modelFallback.ts')
const prose = proseFixture(100)
const answer = (minutes = 0.001, complete = true) => JSON.stringify({ edits: [], review: { passed: true, issues: [], estimatedMinutes: minutes, beatsComplete: complete, missingBeats: complete ? [] : ['Return key'] }, languageReview: { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }, memory: { chapter: { summary: 'Done', events: [], state: [], openThreads: [] }, updates: [{ id: 'cat', kind: 'character', subject: 'cat', text: 'Cat rests.', status: 'current', importance: 'normal', related: [], evidenceSentenceId: 'S1' }] } })
function fixture(outputs, { prior = '', draft = prose, stage = 'review', unknown = false } = {}) {
  let p = { ...createEmptyProject('automatic', 'Automatic'), language: unknown ? 'custom' : 'ja', duration: 0.25, generatedStory: prior, enableHook: false }
  const count = prior ? 2 : 1, cursor = prior ? 1 : 0
  const chapters = Array.from({ length: count }, (_, i) => ({ chapter: i + 1, targetCharacters: 100, estimatedMinutes: .25, beats: ['Rest', 'Return key'], ending: 'Home' }))
  p.outline = { title: 'T', outlineSummary: 'S', chapters: chapters.map(c => ({ chapter: c.chapter, title: 'C', summary: 'S', estimatedWords: 10 })) }
  p.chapterDocuments = prior ? [{ chapter: 1, text: prior, complete: true, chunks: [{ chunk: 0, start: 0, end: prior.length }] }] : []
  p.longStory = { version: 1, cursor, stage, attempt: 0, draft, truncated: false, accepted: prior ? [{ chapter: 1, revision: revisionKey(prior), estimatedMinutes: .25 }] : [], checkpoints: [],
    plan: { version: 1, inputKey: planInputKey(p), outline: p.outline, canon: ['No magic'], chapters, duration: { requestedMinutes: .25, estimatedMinutes: .25 * count, targetCharacters: 100 * count, source: 'ai-estimate' } } }
  let stopped = false, calls = 0, fallback = 0
  const waits = [], prompts = [], saved = []
  const ports = { read: () => p, stopped: () => stopped, progress: () => {}, wait: async ms => { waits.push(ms) }, fallback: async () => { fallback++; return 'same-provider-model' },
    save: async patch => { p = structuredClone({ ...p, ...patch }); saved.push(p) }, chat: async () => { throw Error('unexpected chat') },
    stream: async (messages, emit) => { const gate = nativeGateResponse(messages); if (gate) return gate; calls++; prompts.push(messages); const next = outputs.shift(); if (next instanceof Error) throw next; assert.equal(typeof next, 'string'); emit(next); return { text: next, finishReason: 'stop' } } }
  return { ports, read: () => p, calls: () => calls, waits, prompts, saved, fallback: () => fallback, stop: () => { stopped = true } }
}
let app = fixture([answer()])
await runLongStory(app.ports)
assert.equal(app.read().status, 'done', 'low AI minutes never block calibrated Japanese')
assert.equal(app.calls(), 1)
app = fixture([answer()], { prior: proseFixture(200), draft: proseFixture(30), stage: 'write' })
await runLongStory(app.ports)
assert.equal(app.read().status, 'done', 'short chapter with sufficient cumulative prose and confirmed beats commits')
assert.equal(app.calls(), 1, 'does not rewrite short but complete chapter')
assert.equal(app.read().chapterDocuments[0].text, proseFixture(200))
app = fixture([answer(.25, false), prose, answer()])
await runLongStory(app.ports)
assert(app.prompts[1][0].content.includes('Write literary narration'), 'missing scenes go to writing, not repeated review')
assert.equal(app.read().status, 'done')
app = fixture([new SyntaxError('broken JSON'), answer()])
await runLongStory(app.ports)
assert(app.prompts[1][0].content.includes('Check the supplied chapter'))
assert.equal(app.read().longStory.recoveryHistory[0].kind, 'format')
app = fixture([new Error('ECONNREFUSED fetch failed'), new Error('HTTP 503'), answer()])
await runLongStory(app.ports)
assert.equal(app.fallback(), 1)
assert(app.waits.length === 2 && app.waits[0] > 0 && app.waits[1] > app.waits[0])
assert.equal(app.read().status, 'done')
assert.equal(app.read().longStory.recoveryHistory.length, 2)
app = fixture([new Error('HTTP 401 unauthorized')])
await assert.rejects(runLongStory(app.ports), /cấu hình/)
assert.equal(app.calls(), 1)
app = fixture([JSON.stringify({ ...JSON.parse(answer()), review: { passed: true, issues: [], estimatedMinutes: 10 } }), answer()], { prior: proseFixture(200), draft: proseFixture(30) })
await runLongStory(app.ports)
assert.equal(app.calls(), 2, 'short chapter requires explicit complete-beats confirmation even if AI says passed')
const priorFile = app.read().chapterDocuments[0].text
assert.equal(priorFile, proseFixture(200))
app = fixture(Array.from({ length: 9 }, () => new SyntaxError('invalid JSON')))
await assert.rejects(runLongStory(app.ports), /3 vòng/)
assert.equal(app.calls(), 9, 'review/write transitions never reset recovery infinitely')
app = fixture([new Error('fetch failed'), answer()])
app.ports.wait = async () => app.stop()
await assert.rejects(runLongStory(app.ports), /tạm dừng/)
assert.equal(app.calls(), 1)
await assert.rejects(waitForRecovery({ read: () => ({}), stopped: () => true }, 60000), /tạm dừng/)
assert.equal(classifyFailure(new Error('API_EMPTY_CONTENT timeout')), 'transport')
const settings = { apiProvider: 'vilao', apiBaseUrl: 'https://example.test/v1', apiKey: 'private', model: 'ram/gemini-3.8-flash' }
const chooser = modelFallback(() => settings, async () => ['gemini-3.8-flash', 'video-model', 'claude-opus', 'gpt-mini'], () => false)
assert.equal(await chooser.next(), 'gpt-mini')
assert.equal(await chooser.next(), 'claude-opus')
assert.equal(await chooser.next(), null)
assert.equal(settings.model, 'ram/gemini-3.8-flash')
settings.apiBaseUrl = 'https://changed.test'
assert.equal(chooser.current(), undefined)
assert.equal(await chooser.next(), null)
const delayed = modelFallback(() => settings, async () => { settings.model = 'user-selected-model'; return ['gpt-mini'] }, () => false)
assert.equal(await delayed.next(), null, 'a user settings change wins over a pending catalog result')
console.log('PASS: calibrated minutes, cumulative budgets, stage routing, bounded attempts, backoff, cancellation, history and same-provider fallback')
if (process.argv.includes('--projects')) {
  for (const entry of fs.readdirSync('data/projects')) {
    const file = path.join('data/projects', entry, 'project.json')
    if (!fs.existsSync(file)) continue
    const bytes = fs.readFileSync(file), p = JSON.parse(bytes).project
    if (!['18-1', '18-4'].includes(p.name)) continue
    const result = chapterReadiness(p, p.longStory.draft)
    assert(result.valid)
    assert.equal(p.longStory.accepted.length, p.longStory.cursor)
    assert.deepEqual(fs.readFileSync(file), bytes)
    console.log(JSON.stringify({ name: p.name, chapter: p.longStory.cursor + 1, ...result, unchanged: true }))
  }
}
