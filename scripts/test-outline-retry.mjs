import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const rendererRoot = path.resolve('src/renderer/src')

function createHarness(responses, inputType = 'idea', streamResponses = []) {
  const cache = new Map()
  const calls = []
  const streamCalls = []
  let cancelled = false
  class CancelledError extends Error {}
  class ApiRequestError extends Error {}
  const api = {
    CancelledError, ApiRequestError,
    clearCancel: () => { cancelled = false },
    isCancelled: () => cancelled,
    abortOwner: () => { cancelled = true },
    chatStream: async (messages, onChunk) => {
      streamCalls.push(messages)
      const text = streamResponses[streamCalls.length - 1]
      assert.notEqual(text, undefined, 'stream must stay within response budget')
      if (text === 'CANCEL') { cancelled = true; throw new CancelledError() }
      const response = text
      onChunk(response)
      return response
    },
    chat: async (messages, options, owner) => {
      calls.push({ messages, options, owner })
      assert.equal(store.getState().getActiveRuntime().error, null, 'no error banner during retries')
      const response = responses[calls.length - 1]
      if (response === 'CANCEL') {
        cancelled = true
        throw new CancelledError()
      }
      if (response === 'API_ERROR') throw new ApiRequestError('API exhausted its own retries')
      assert.notEqual(response, undefined, 'must not request more responses than provided')
      return response
    }
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const resolve = (id) => {
      if (id === '@/services/apiService') return api
      if (id.startsWith('@shared/')) return load(path.resolve('src/shared', `${id.slice(8)}.ts`))
      if (!id.startsWith('@/')) return require(id)
      const target = path.join(rendererRoot, id.slice(2))
      return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
    }
    // Disable only the unrelated disk-save timer; generation and validation execute unchanged.
    new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', output)(
      module, module.exports, resolve, () => 0, () => {}
    )
    return module.exports
  }
  const { createEmptyProject } = load(path.join(rendererRoot, 'types/index.ts'))
  const { useAppStore: store } = load(path.join(rendererRoot, 'stores/storyStore.ts'))
  const profile = {
    sourceType: 'outline', creativeBrief: 'A new story about courage.',
    ...Object.fromEntries([
      'sourceGenreTags', 'genreCore', 'settingEraCore', 'storyCore', 'progressionCore',
      'audiencePromise', 'avoidGenreDrift', 'essence', 'expansionOpportunities', 'requiredElements',
      'forbiddenNames', 'forbiddenSettings', 'forbiddenObjects', 'forbiddenPlotBeats', 'forbiddenTwists'
    ].map((key) => [key, []]))
  }
  store.setState({
    projects: [{ ...createEmptyProject('test', 'Retry test'), writingEngine: 'chapter-v2', ideaInputType: inputType,
      idea: 'A lighthouse keeper finds a lost map.', language: 'en', currentStep: 2,
      questions: ['Who?'], answers: { 0: 'A lighthouse keeper.' },
      inspirationProfile: inputType === 'outline' ? profile : null }],
    activeProjectId: 'test'
  })
  return { store, calls, streamCalls }
}

const outline = {
  title: 'The Map', outlineSummary: 'A keeper follows a map and returns home.',
  chapters: [{ chapter: 1, title: 'Home', summary: 'A keeper finds a map and saves a sailor.', estimatedWords: 1000 }]
}
const valid = JSON.stringify(outline)

{
  const { store, calls } = createHarness(['not JSON', valid])
  await store.getState().generateOutline()
  assert.equal(calls.length, 2, 'invalid response is regenerated automatically')
  assert.match(calls[0].messages[0].content, /500–1000 narrated characters/, 'store passes a soft pacing estimate for the configured English narration speed')
  assert.deepEqual(store.getState().getActiveProject().outline, outline)
  assert.equal(store.getState().getActiveProject().outlinePhase, 'reviewing')
  assert.equal(store.getState().getActiveRuntime().error, null)
  console.log('PASS: malformed response then success')
}

{
  const { store, calls } = createHarness(['', '{"title":', 'not JSON'])
  await store.getState().generateOutline()
  assert.equal(calls.length, 3, 'stop after exactly three total attempts')
  assert.match(store.getState().getActiveRuntime().error, /3 lần/)
  assert.equal(store.getState().getActiveRuntime().isGenerating, false)
  assert.equal(store.getState().getActiveProject().outline, null)
  console.log('PASS: three failures produce one final error')
}

for (const bad of [
  { ...outline, chapters: [] }, { ...outline, chapters: 'invalid' },
  { ...outline, title: 42 }, { ...outline, outlineSummary: null },
  { ...outline, chapters: [{ chapter: 1, title: 'x' }] },
  { ...outline, chapters: [{ ...outline.chapters[0], estimatedWords: -1 }] }
]) {
  const { store, calls } = createHarness([JSON.stringify(bad), valid])
  await store.getState().generateOutline()
  assert.equal(calls.length, 2, 'invalid schema is rejected and retried')
  assert.deepEqual(store.getState().getActiveProject().outline, outline)
}
console.log('PASS: outline schema validation')

for (const response of ['CANCEL', 'API_ERROR']) {
  const { store, calls } = createHarness([response])
  await store.getState().generateOutline()
  assert.equal(calls.length, 1, 'cancellation/API errors do not start another generation loop')
  if (response === 'CANCEL') assert.equal(store.getState().getActiveRuntime().error, null)
  else assert.match(store.getState().getActiveRuntime().error, /API exhausted/)
}
console.log('PASS: cancellation and API error boundaries')

for (const responses of [[valid], ['bad', 'bad', valid], ['```json\n' + valid + '\n```']]) {
  const { store, calls } = createHarness(responses)
  await store.getState().generateOutline()
  assert.equal(calls.length, responses.length)
  assert.deepEqual(store.getState().getActiveProject().outline, outline)
  assert.equal(store.getState().getActiveRuntime().error, null)
  if (calls.length > 1) assert.match(calls[1].messages[0].content, /previous attempt returned invalid/)
}
console.log('PASS: first/third attempt success and fenced JSON')

const passingAudit = JSON.stringify({
  passed: true, score: 100, changedAxes: Array.from({ length: 10 }, (_, i) => `axis ${i}`),
  reusedFingerprints: [], similarPlotBeats: [], sameTwistOrEnding: false,
  genreFidelityScore: 100, settingFidelityScore: 100
})
for (const responses of [
  ['bad', valid, passingAudit],
  [valid, 'bad audit', valid, passingAudit],
  [valid, JSON.stringify({ passed: false, score: 0 }), valid, passingAudit]
]) {
  const { store, calls } = createHarness(responses, 'outline')
  await store.getState().generateOutline()
  assert.equal(calls.length, responses.length)
  assert.equal(store.getState().getActiveProject().originalityReport.passed, true)
  assert.equal(store.getState().getActiveRuntime().error, null)
}
console.log('PASS: reference-outline parsing and audit retries remain functional')

const leaked = JSON.stringify({ ...outline, title: 'Một người đứng giữa thành phố' })
for (const responses of [[leaked, 'bad repair', valid], [leaked, leaked, valid], [leaked, 'CANCEL']]) {
  const { store, calls } = createHarness(responses)
  await store.getState().generateOutline()
  assert.equal(calls.length, responses.length)
  assert.equal(store.getState().getActiveRuntime().error, null)
  if (!responses.includes('CANCEL')) assert.deepEqual(store.getState().getActiveProject().outline, outline)
}
console.log('PASS: language repair failures regenerate; cancellation stops repair')

globalThis.window = { api: { saveProject: async () => [] } }
for (const [responses, shouldPass] of [
  [['x'.repeat(1500)], true],
  [['CANCEL'], false]
]) {
  const correction = JSON.stringify({ edits: [], languageReview: { language: 'vi', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }, memory: { chapter: { summary: 'Opening.', events: [], state: [], openThreads: [] }, story: { facts: ['The opening happened.'], openThreads: [] } } })
  const { store, calls, streamCalls } = createHarness(shouldPass ? [correction] : [], 'idea', responses)
  const project = store.getState().getActiveProject()
  store.setState({ projects: [{ ...project, idea: 'Isekai: a watch pulls a repairer into another world.',
    language: 'vi', duration: 1, readingSpeed: 1500, outline, enableHook: false }] })
  await store.getState().confirmAndWrite()
  assert.equal(streamCalls.length, responses.length)
  assert.equal(calls.length, shouldPass ? 1 : 0, 'one correction+memory call, no second verification')
  assert(!streamCalls[0][1].content.includes('Hard limit: 900 characters'))
  const final = store.getState().getActiveProject()
  assert.equal(final.status === 'done', shouldPass)
  if (shouldPass) assert.equal(final.generatedStory, 'x'.repeat(1500), 'valid long opening is retained instead of regenerated')
  else if (responses[0] === 'CANCEL') assert.equal(store.getState().getActiveRuntime().error, null)
  else assert.match(store.getState().getActiveRuntime().error, /3 lần/)
}
console.log('PASS: valid isekai opening over 900 characters uses one writing call; cancellation is respected')
