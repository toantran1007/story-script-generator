import { proseFixture } from './lib/prose-fixture.mjs'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve('src/renderer/src')
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
export function harness(responses = [], chats = [], engine = 'legacy', enforceLength = false, recover = false, gateResponses = []) {
  const cache = new Map(), saved = [], calls = [], chatCalls = [], gateCalls = [], previews = [], streamOptions = []
  let cancelled = false
  class CancelledError extends Error {}
  const api = {
    CancelledError, clearCancel: () => { cancelled = false }, isCancelled: () => cancelled,
    abortOwner: () => { cancelled = true },
    chatStream: async (messages, onChunk, _options, _owner, onFinish) => {
      calls.push(messages)
      streamOptions.push(_options)
      const next = responses.shift()
      const raw = next && typeof next === 'object' && !(next instanceof Error) ? next.text : next
      if (raw === 'CANCEL') { cancelled = true; throw new CancelledError() }
      if (raw instanceof Error) throw raw
      assert.equal(typeof raw, 'string', 'unexpected writing request')
      for (let start = 0; start < raw.length; start += 7) {
        onChunk(raw.slice(start, start + 7))
        previews.push(store.getState().getActiveRuntime().streamingText)
      }
      onFinish?.(next?.finishReason || 'stop')
      return raw
    },
    chat: async (messages) => {
      if (messages[0].content.startsWith('INDEPENDENT LANGUAGE GATE:')) {
        gateCalls.push(messages)
        const next = gateResponses.shift()
        if (next instanceof Error) throw next
        return typeof next === 'function' ? next(messages) : next || JSON.stringify({ language: JSON.parse(messages[1].content).language, complete: true, chapterReview: { complete: true, noRepeatedCompletion: true, noPrematureCompletion: true, knowledgeConsistent: true }, issues: [], unresolved: [] })
      }
      chatCalls.push(messages); assert(chats.length, 'unexpected summary/audit request'); const next = chats.shift(); if (next instanceof Error) throw next; return typeof next === 'function' ? next(messages) : next
    }
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', transpile(fs.readFileSync(file, 'utf8')))(
      module, module.exports, (id) => {
        if (id.startsWith('@shared/')) return load(path.resolve('src/shared', `${id.slice(8)}.ts`))
        if (id === '@/services/apiService') return api
        // Phase-level suites assert the inner limit; recovery has its own integration suite.
        if (id === '@/services/chapterRecovery' && !recover) return { recoverChapter: run => run() }
        // Existing memory tests use tiny prose fixtures, independent of duration.
        // Duration integration tests explicitly enable the real length policy.
        if (id === '@/services/chapterLength' && !enforceLength) {
          const actual = load(path.join(root, 'services/chapterLength.ts'))
          return { ...actual, chapterLength: (...args) => ({ ...actual.chapterLength(...args), valid: true }) }
        }
        if (!id.startsWith('@/') && !id.startsWith('.')) return require(id)
        const target = id.startsWith('.') ? path.resolve(path.dirname(file), id) : path.join(root, id.slice(2))
        return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
      }, () => 1, () => {}
    )
    return module.exports
  }
  const types = load(path.join(root, 'types/index.ts'))
  const mem = load(path.join(root, 'services/chapterMemory.ts'))
  const hook = load(path.join(root, 'services/hookExcerpt.ts'))
  const { useAppStore: store } = load(path.join(root, 'stores/storyStore.ts'))
  globalThis.window = { api: { saveProject: async (p) => { saved.push(structuredClone(p)); return [] }, exportStory: async () => true } }
  const project = { ...types.createEmptyProject('test', 'Test'), writingEngine: engine === 'legacy' ? undefined : 'chapter-v2', language: 'vi', duration: 4, enableHook: false,
    idea: 'Lan sửa đồng hồ rồi đem trả.', outline: { title: 'The clock', outlineSummary: 'Lan repairs and returns a clock.', chapters: [
      { chapter: 1, title: 'Repair', summary: 'Repair the clock.', estimatedWords: 500 },
      { chapter: 2, title: 'Return', summary: 'Return it.', estimatedWords: 500 }
    ] } }
  store.setState({ projects: [project], activeProjectId: 'test' })
  // Exercise the retained legacy resume path, not the new fresh-writing engine.
  if (engine === 'legacy') store.setState({ confirmAndWrite: async () => {
    const p = store.getState().getActiveProject()
    store.setState({ projects: [{ ...p, chapterMemories: [], writingMemory: {
      completedChapters: 0, currentChapter: 0, currentChunk: 0, chapterCharsWritten: 0,
      totalChapters: p.outline.chapters.length, lastContext: '', startedAt: new Date().toISOString(), lastWriteAt: new Date().toISOString()
    } }] })
    await store.getState().continueWriting()
  } })
  return { store, types, mem, hook, saved, calls, chatCalls, gateCalls, previews, streamOptions, project, load }
}

const firstMemory = { chapter: { summary: 'Lan repaired the clock.', events: ['CLOCK_REPAIRED'], state: ['Lan holds the repaired clock at the workshop.'], openThreads: ['Return it to An.'] },
  story: { facts: ['No magic can repair a clock.', 'Lan holds the repaired clock.'], openThreads: ['Return it to An.'] } }
const secondMemory = { chapter: { summary: 'Lan returned it.', events: ['CLOCK_RETURNED'], state: ['An holds it; Lan is home.'], openThreads: [] },
  story: { facts: ['No magic can repair a clock.', 'An has the clock; Lan is home.'], openThreads: [] } }
const encode = (text, memory) => `${text}\n<<<STORY_MEMORY_V1>>>\n${JSON.stringify(memory)}`
const firstText = 'Lan sửa đồng hồ xong.\nTa đem trả thôi.'
const secondText = 'Lan trao đồng hồ cho An.\nCô trở về nhà.'
let app = harness([encode(firstText, firstMemory), encode(secondText, secondMemory)])
await app.store.getState().confirmAndWrite()
let result = app.store.getState().getActiveProject()
assert.equal(result.status, 'done')
assert.equal(result.writingMemory, null)
assert.equal(result.chapterMemories.length, 2)
assert(result.chapterMemories.every((m) => m.complete))
assert.deepEqual(result.storyMemory, secondMemory.story)
assert.equal(result.generatedStory, `${firstText}\n\n${secondText}`)
assert.equal(app.chatCalls.length, 0, 'memory comes with writing, no review or summary API')
assert(app.calls[1][1].content.includes('CLOCK_REPAIRED'))
assert(app.calls[1][1].content.includes('No magic can repair a clock.'))
assert(!app.calls[1][0].content.includes('EARLIER CHAPTER PLAN'), 'actual memory replaces historical outline assumptions')
assert(app.previews.every((text) => !text.includes('STORY_MEMORY') && !text.includes('"chapter"') && !text.includes('CLOCK_REPAIRED')))
assert(app.saved.some((p) => p.chapterMemories?.[0]?.complete && p.writingMemory?.completedChapters === 1))
assert.equal(app.store.getState().reviewStory, undefined)
assert.equal(result.qualityReviewState, undefined, 'completion is not labelled as a passed audit')
console.log('PASS: two chapters persist their own memory and global state, hide metadata and require only two writing calls')

app = harness([encode(firstText, firstMemory), 'CANCEL'])
await app.store.getState().confirmAndWrite()
const interrupted = structuredClone(app.store.getState().getActiveProject())
assert.equal(interrupted.writingMemory.completedChapters, 1)
const resumed = harness([encode(secondText, secondMemory)])
resumed.store.setState({ projects: [interrupted], activeProjectId: 'test' })
await resumed.store.getState().continueWriting()
assert.equal(resumed.calls.length, 1)
assert(resumed.calls[0][1].content.includes('CLOCK_REPAIRED'))
assert.equal(resumed.store.getState().getActiveProject().generatedStory.trim(), `${firstText}\n\n${secondText}`)
console.log('PASS: persisted chapter memory survives cancellation/restart; completed chapter is not rewritten')

app = harness([encode(proseFixture(2000), firstMemory), encode(secondText, secondMemory)])
app.store.setState({ projects: [{ ...app.project, duration: 3, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert(app.calls[1][1].content.includes('"currentChapter"'))
assert(app.calls[1][1].content.includes('CLOCK_REPAIRED'))
assert(!app.calls[1][1].content.includes(proseFixture(1201)), 'only a short prose tail is forwarded')
assert.equal(app.store.getState().getActiveProject().chapterMemories.length, 1)
console.log('PASS: current-chapter memory is updated between chunks; prose context is bounded')

app = harness([encode(proseFixture(2000), firstMemory), 'CANCEL'])
app.store.setState({ projects: [{ ...app.project, duration: 3, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
const middle = structuredClone(app.store.getState().getActiveProject())
assert.equal(middle.writingMemory.currentChunk, 1)
assert.equal(middle.chapterMemories[0].complete, false)
app = harness([encode(secondText, secondMemory)])
app.store.setState({ projects: [middle], activeProjectId: 'test' })
await app.store.getState().continueWriting()
assert.equal(app.calls.length, 1)
assert(app.calls[0][1].content.includes('CLOCK_REPAIRED'))
assert.equal(app.store.getState().getActiveProject().chapterMemories[0].complete, true)
assert.equal(app.store.getState().getActiveProject().generatedStory.trim(), proseFixture(2000) + '\n\n' + secondText)
console.log('PASS: mid-chapter restart uses the accepted chunk memory and does not replay that chunk')

app = harness([encode(proseFixture(2000), firstMemory), encode(proseFixture(2000), secondMemory)])
app.store.setState({ projects: [{ ...app.project, duration: 3, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.match(app.store.getState().getActiveRuntime().error, /nguyên khối/)
assert.equal(app.store.getState().getActiveProject().generatedStory, proseFixture(2000))
assert.equal(app.store.getState().getActiveProject().memoryPackets.length, 1)
console.log('PASS: exact repeated chunks are rejected locally without another review API call')

const v2First = { chapter: { summary: 'Clock repaired.', events: ['Clock repaired.'], state: [], openThreads: [] }, updates: [
  { id: 'clock-owner', kind: 'object', subject: 'đồng hồ', text: 'Lan giữ đồng hồ đã sửa.', status: 'current', importance: 'normal', related: ['Lan'], evidence: 'Lan sửa đồng hồ xong.' }
] }
const v2Second = { chapter: { summary: 'Clock returned.', events: ['Clock returned.'], state: [], openThreads: [] }, updates: [
  { ...v2First.updates[0], text: 'An giữ đồng hồ.', related: ['An'], evidence: 'Lan trao đồng hồ cho An.' }
] }
app = harness([encode(firstText, v2First), encode(secondText, v2Second)])
await app.store.getState().confirmAndWrite()
const detailed = app.store.getState().getActiveProject()
assert.equal(detailed.status, 'done')
assert.equal(detailed.memoryRecords.find((r) => r.id === 'clock-owner').version, 2)
assert.equal(detailed.chapterDocuments[1].text, secondText)
assert.equal(detailed.memoryPackets.length, 2)
assert(app.calls[1][1].content.includes('clock-owner'))
assert.equal(app.chatCalls.length, 0)
assert(app.previews.every((text) => !text.includes('clock-owner')))
console.log('PASS: actual writing store accepts V2 deltas, sends selected prior memory, persists chapter text/history and never leaks metadata')

const badEvidence = { ...v2First, updates: [{ ...v2First.updates[0], evidence: 'Model paraphrased a line that is not in the story.' }] }
app = harness([encode(firstText, badEvidence), 'CANCEL'])
await app.store.getState().confirmAndWrite()
const warningDraft = structuredClone(app.store.getState().getActiveProject())
assert.equal(warningDraft.generatedStory.trim(), firstText)
assert.equal(warningDraft.writingMemory.completedChapters, 1)
assert.equal(warningDraft.memoryRecords[0].status, 'unknown')
assert.equal(warningDraft.memoryIssues[0].recordId, 'clock-owner')
assert.equal(warningDraft.memoryPackets[0].payload.updates[0].evidence, badEvidence.updates[0].evidence)
assert.equal(app.store.getState().getActiveRuntime().error, null)
assert(app.store.getState().getActiveRuntime().logs.some((log) => log.level === 'warn' && log.message.includes('clock-owner') && log.detail.includes('Model paraphrased')))
assert(app.saved.some((snapshot) => snapshot.generatedStory.trim() === firstText && snapshot.memoryIssues?.length === 1))
const afterWarning = harness([encode(secondText, v2Second)])
afterWarning.store.setState({ projects: [warningDraft], activeProjectId: 'test' })
await afterWarning.store.getState().continueWriting()
assert.equal(afterWarning.calls.length, 1)
assert.equal(afterWarning.chatCalls.length, 0, 'no separate evidence-repair or review API')
assert.equal(afterWarning.store.getState().getActiveProject().status, 'done')
assert.equal(afterWarning.store.getState().getActiveProject().memoryRecords[0].source.verified, true)
assert.equal(afterWarning.store.getState().getActiveProject().generatedStory.trim(), `${firstText}\n\n${secondText}`)
assert(afterWarning.calls[0][1].content.includes('"status":"unknown"'))
console.log('PASS: evidence mismatch saves the prose/raw packet/warning, resumes without rewriting and does not trigger another API call')

for (const raw of [firstText, encode(firstText, firstMemory).slice(0, -8), encode('', firstMemory),
  encode(firstText, { ...firstMemory, story: { facts: [], openThreads: [] } }),
  encode(firstText, { ...firstMemory, chapter: { ...firstMemory.chapter, summary: 'x'.repeat(24001) } })]) {
  app = harness([raw, raw, raw])
  await app.store.getState().confirmAndWrite()
  assert(app.store.getState().getActiveRuntime().error)
  assert.equal(app.store.getState().getActiveProject().generatedStory, '')
  assert.equal(app.store.getState().getActiveProject().chapterMemories.length, 0)
  assert.equal(app.chatCalls.length, 0)
  assert.equal(app.calls.length, 3, 'malformed story/memory retries at most three times')
  assert.match(app.store.getState().getActiveRuntime().error, /sau 3 lần/)
}
const { mem, types, hook } = harness()
for (const [raw, code] of [
  ['', 'empty_response'], [' \n\t', 'empty_response'],
  [firstText, 'missing_memory'], [JSON.stringify({ story: firstText, memory: firstMemory }), 'missing_memory'],
  [encode('', firstMemory), 'empty_story'], [encode('# Title only', firstMemory), 'empty_story'],
  [encode(firstText, firstMemory) + mem.MEMORY_MARKER, 'duplicate_memory'],
  [encode(firstText, firstMemory).slice(0, -3), 'invalid_memory_json'],
  [encode(firstText, {}), 'invalid_memory_schema'],
  [encode(firstText, { ...firstMemory, chapter: { ...firstMemory.chapter, summary: 'x'.repeat(24001) } }), 'memory_too_large']
]) {
  assert.throws(() => mem.parseWritingResponse(raw), (error) => {
    assert(error instanceof mem.WritingResponseError)
    assert.equal(error.code, code)
    assert.equal(error.counts.response, raw.length)
    assert(error.message.includes(`phản hồi ${raw.length} ký tự`))
    if (raw.includes(mem.MEMORY_MARKER)) assert(error.message.includes('memory '))
    return true
  })
}
console.log('PASS: response diagnostics distinguish empty, missing/duplicate separator, invalid JSON/schema and memory size with actual character counts')

for (const bad of ['', JSON.stringify({ story: firstText }), encode(firstText, firstMemory).slice(0, -3)]) {
  app = harness([bad, encode(proseFixture(1500), firstMemory)])
  app.store.setState({ projects: [{ ...app.project, idea: 'Isekai xuyên không.', duration: 1, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
  await app.store.getState().confirmAndWrite()
  assert.equal(app.calls.length, 2)
  assert.equal(app.store.getState().getActiveProject().generatedStory, proseFixture(1500))
  assert.equal(app.store.getState().getActiveProject().memoryPackets.length, 1)
  assert.equal(app.store.getState().getActiveRuntime().error, null)
  assert(app.store.getState().getActiveRuntime().logs.some((log) => log.level === 'warn' && log.message.includes(`phản hồi ${bad.length} ký tự`)))
}
app = harness(['', '', encode(proseFixture(1800), firstMemory)])
app.store.setState({ projects: [{ ...app.project, duration: 1, outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 3)
assert.equal(app.store.getState().getActiveProject().generatedStory.length, 1800)
console.log('PASS: malformed/empty responses retry, long valid responses succeed on second/third attempt, rejected attempts never enter story or memory')

app = harness([encode(firstText, firstMemory)], [encode(proseFixture(1600), firstMemory)])
app.store.setState({ projects: [{ ...app.project, language: 'en', idea: 'Isekai across worlds.', duration: 1,
  outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1)
assert.equal(app.chatCalls.length, 1, 'language repair is not followed by a length-based regeneration')
assert.equal(app.store.getState().getActiveProject().generatedStory.length, 1600)
assert.equal(app.store.getState().getActiveRuntime().error, null)
console.log('PASS: valid language-repaired prose over the old first-minute limit is accepted')

app = harness([encode(firstText, firstMemory), '', '', ''])
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 4, 'one accepted chapter plus three attempts for the bad chapter')
assert.equal(app.store.getState().getActiveProject().generatedStory.trim(), firstText)
assert.equal(app.store.getState().getActiveProject().writingMemory.completedChapters, 1)
assert.equal(app.store.getState().getActiveProject().chapterMemories.length, 1)
assert.match(app.store.getState().getActiveRuntime().error, /empty_response.*phản hồi 0 ký tự/)
for (const terminal of ['CANCEL', new Error('API transport failed')]) {
  app = harness(['', terminal])
  await app.store.getState().confirmAndWrite()
  assert.equal(app.calls.length, 2, 'cancellation/transport failure do not trigger another response-format retry')
  if (terminal === 'CANCEL') assert.equal(app.store.getState().getActiveRuntime().error, null)
  else assert.match(app.store.getState().getActiveRuntime().error, /API transport failed/)
}
console.log('PASS: retries preserve earlier chapters; cancellation and API failures retain their own handling')
for (let length = 1; length <= mem.MEMORY_MARKER.length; length++) {
  assert.equal(mem.visibleStoryText(`${firstText}\n${mem.MEMORY_MARKER.slice(0, length)}`), firstText)
}
assert.equal(mem.visibleStoryText('Story.\n{"chapter":'), 'Story.')
const migrated = types.recoverStaleProject({ ...types.createEmptyProject('old', 'Old'), qualityReviewState: 'failed', generatedStory: firstText, preReviewStory: 'Backup.', status: 'writing', outlinePhase: 'writing' })
assert.equal(migrated.status, 'done')
assert.equal(migrated.qualityReviewState, undefined)
assert.equal(migrated.generatedStory, firstText)
assert.equal(migrated.preReviewStory, 'Backup.')
assert.equal(hook.verifiedHookExcerpt(firstText, JSON.stringify({ excerpt: 'Ta đem trả thôi.' }), 900), 'Ta đem trả thôi.')
assert.throws(() => hook.verifiedHookExcerpt(firstText, JSON.stringify({ excerpt: 'A new danger appeared.' }), 900))
console.log('PASS: invalid memory never commits partial state; legacy review flags migrate safely; verbatim hook protection remains')
