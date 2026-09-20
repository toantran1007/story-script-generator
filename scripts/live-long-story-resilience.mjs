// Real stream cancellation + resume and real contradiction repair on synthetic prose.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings)
const source = JSON.parse(fs.readFileSync('live-long-story-en-20260916/data/projects/live-en/project.json', 'utf8')).project
const output = path.resolve('live-long-story-resilience-20260916')
const files = new ProjectFileStore(path.join(output, 'data'))
const report = { calls: [], interruptedStream: false, resumed: false, contradictionRepaired: false }
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
let count = 0, stop = false, interrupt = true, tokens = 0
let project = { ...source, id: 'real-interruption', name: 'Real interruption test', generatedStory: '', hookText: '', chapterDocuments: [], chapterMemories: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], storyMemory: null, writingMemory: null, pendingChapter: null, status: 'writing',
  longStory: { ...source.longStory, cursor: 0, stage: 'write', attempt: 0, accepted: [], checkpoints: [], draft: undefined, error: undefined } }
files.save(project)
async function call(messages, options, stream, emit = () => {}) {
  assert(++count <= 16, 'Paid call cap reached')
  const req = providerRequest(settings, messages, options, stream)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 300000)
  const item = { call: count, stream }; report.calls.push(item)
  const started = Date.now(); console.log(JSON.stringify({ ...item, event: 'started' }))
  try {
    const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: controller.signal })
    item.http = res.status
    if (!res.ok) throw Error('HTTP ' + res.status)
    if (!stream) {
      const raw = await res.json(); const text = usesResponses(settings) ? responseText(raw) : readChatResponse(raw)
      fs.writeFileSync(path.join(output, `review-${count}.json`), text)
      return { text, finishReason: 'stop' }
    }
    return await (usesResponses(settings) ? readResponsesStream : readChatStream)(res.body.getReader(), token => {
      emit(token); tokens += token.length
      if (interrupt && tokens > 200) { interrupt = false; stop = true; controller.abort() }
    })
  } catch (error) { item.error = stop ? 'user_stop' : error.name; throw error }
  finally { clearTimeout(timer); item.seconds = Math.round((Date.now() - started) / 1000); persist(); console.log(JSON.stringify(item)) }
}
const ports = {
  read: () => project, stopped: () => stop,
  save: async patch => { const next = { ...project, ...patch, updatedAt: new Date().toISOString() }; files.save(next); project = next },
  chat: async (m, o) => (await call(m, o, false)).text,
  stream: (m, emit, o) => call(m, o, true, emit),
  progress: (message, text) => { if (text === undefined) console.log(message) }
}
try {
  try { await runLongStory(ports) } catch (error) { if (!stop) throw error }
  assert(stop)
  project = files.list().find(p => p.id === 'real-interruption')
  assert(project.pendingChapter.text.length >= 200)
  assert(project.pendingChapter.truncated)
  assert.equal(project.longStory.cursor, 0)
  report.interruptedStream = true; persist()
  stop = false
  await runLongStory(ports)
  assert.equal(project.status, 'done')
  assert.equal(project.chapterDocuments.length, source.longStory.plan.chapters.length)
  report.resumed = true; persist()

  // Use a separate project snapshot; original accepted outputs are untouched.
  const priorText = source.chapterDocuments.slice(0, 2).map(d => d.text).join('\n\n')
  const bad = source.chapterDocuments[2].text.replace('The kitchen light was still on', 'Inside the notebook they discovered a secret inheritance worth a million dollars. The kitchen light was still on')
  assert.notEqual(bad, source.chapterDocuments[2].text)
  project = { ...source, id: 'real-conflict', name: 'Real conflict test', status: 'writing', generatedStory: priorText,
    chapterDocuments: source.chapterDocuments.slice(0, 2), chapterMemories: source.chapterMemories.slice(0, 2), memoryRecords: source.memoryRecords.filter(m => m.source.chapter < 3),
    longStory: { ...source.longStory, cursor: 2, stage: 'review', attempt: 0, draft: bad, accepted: source.longStory.accepted.slice(0, 2), error: undefined },
    pendingChapter: { chapterIndex: 2, text: bad, truncated: false } }
  files.save(project)
  await runLongStory(ports)
  assert.equal(project.status, 'done')
  assert(!project.chapterDocuments[2].text.includes('a million dollars'))
  assert.equal(project.chapterDocuments[0].text, source.chapterDocuments[0].text)
  report.contradictionRepaired = true; persist()
} catch (error) {
  report.error = String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]'); persist(); process.exitCode = 1
}
console.log(JSON.stringify(report))
