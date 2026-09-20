// Real provider responses; synthetic story only. No user-project reads or writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings)
const output = path.resolve('live-continuation-' + new Date().toISOString().replace(/[:.]/g, '-'))
const files = new ProjectFileStore(path.join(output, 'data'))
const report = { syntheticOnly: true, model: settings.model, calls: [], scenarios: [] }
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
const base = '雨がやむと、花は村の図書館の窓を開けた。机には赤い紐のついた真鍮の鍵が一本だけ置かれていた。館長は昼までにその鍵を木箱へ戻すように頼んでいた。花は机の水滴を布で拭き、返された本を棚へ並べた。\n\n最後の一冊を片付けると、彼女は真鍮の鍵を手に取り、空の木箱の前に立った。'
const anchor = '最後の一冊を片付けると、彼女は真鍮の鍵を手に取り、空の木箱の前に立った。'
let paid = 0
for (const mode of ['full-echo', 'tail-echo', 'interrupted-echo']) {
  let project = { ...createEmptyProject(mode, mode), language: 'ja', duration: 1, style: 'custom', customStyle: 'quiet realistic slice of life', enableHook: false,
    idea: 'Hana returns the only brass key to a wooden box, closes the library and goes home. No other key, magic or new subplot.' }
  const outline = { title: '鍵を戻す', outlineSummary: '花が鍵を戻して帰る。', chapters: [{ chapter: 1, title: '木箱', summary: '花は一本の鍵を木箱へ戻し、図書館を閉めて家に帰る。', estimatedWords: 150 }] }
  project = { ...project, outline, status: 'writing', outlinePhase: 'writing', currentStep: 3, pendingChapter: { chapterIndex: 0, text: base, truncated: true }, longStory: {
    version: 1, cursor: 0, stage: 'write', attempt: 0, accepted: [], checkpoints: [], draft: base, truncated: true,
    plan: { version: 1, inputKey: planInputKey(project), outline, canon: ['鍵は一本だけ。', '魔法は存在しない。'],
      duration: { requestedMinutes: 1, estimatedMinutes: 1, targetCharacters: 300, source: 'ai-estimate', rationale: 'Synthetic continuation fixture' },
      chapters: [{ chapter: 1, targetCharacters: 300, estimatedMinutes: 1, beats: ['鍵を木箱に戻す', '図書館を閉めて帰る'], ending: '花が家に帰る。' }] } } }
  files.save(project)
  let first = true, stopped = false, firstRaw = '', aborted = false
  const events = []
  const ports = {
    read: () => project, stopped: () => stopped,
    save: async patch => { const next = { ...project, ...patch, updatedAt: new Date().toISOString() }; files.save(next); project = next },
    progress: (message, text) => { if (text === undefined) { events.push(message); console.log(mode + ': ' + message) } },
    chat: async () => { throw Error('Unexpected non-streaming request') },
    stream: async (messages, emit, options) => {
      assert(paid < 15, 'Paid request cap reached')
      const scenarioRequest = first; first = false
      const sent = structuredClone(messages)
      const repeat = mode === 'tail-echo' ? anchor : base
      if (scenarioRequest) sent[0].content += `\nTRANSPORT REGRESSION TEST: Override the tail-only output convention for this response ONLY. Begin with this EXACT unchanged prefix, then append new prose finishing the approved beats. This intentionally tests the application's echo-removal support. Do not alter the prefix, add headings or metadata. PREFIX:\n${repeat}`
      const req = providerRequest(settings, sent, options, true)
      const item = { number: ++paid, scenario: mode, model: settings.model, streaming: true }; report.calls.push(item); persist()
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 180000), start = Date.now()
      let raw = ''
      console.log(JSON.stringify({ ...item, event: 'started' }))
      try {
        const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: controller.signal })
        item.http = res.status
        if (!res.ok) throw Error('HTTP ' + res.status)
        const result = await (usesResponses(settings) ? readResponsesStream : readChatStream)(res.body.getReader(), token => {
          raw += token; emit(token)
          if (scenarioRequest && mode === 'interrupted-echo' && raw.length > base.length + 30) { stopped = true; aborted = true; controller.abort() }
        })
        return result
      } finally {
        if (scenarioRequest) firstRaw = raw
        clearTimeout(timeout); item.seconds = Math.round((Date.now() - start) / 1000); item.chars = raw.length; item.interrupted = stopped
        fs.writeFileSync(path.join(output, `response-${item.number}.txt`), raw)
        persist(); console.log(JSON.stringify(item))
      }
    }
  }
  try {
    try { await runLongStory(ports) } catch (error) { if (!stopped) throw error }
    assert(firstRaw.startsWith(mode === 'tail-echo' ? anchor : base), 'Provider did not return the intended real echo; cannot claim echo coverage')
    if (stopped) {
      assert(aborted)
      project = files.list().find(p => p.id === mode)
      assert.equal(project.longStory.draft, base)
      assert.equal(project.longStory.continuationBuffer.base, base)
      assert(project.longStory.continuationBuffer.text.startsWith(base))
      stopped = false
      await runLongStory(ports)
    }
    assert.equal(project.status, 'done')
    assert.equal(project.chapterDocuments.length, 1)
    assert(project.generatedStory.startsWith(base), 'immutable base was changed')
    assert.equal(project.generatedStory.split(base).length - 1, 1)
    assert.equal(project.generatedStory.split(anchor).length - 1, 1)
    assert.equal(project.longStory.continuationBuffer, undefined)
    report.scenarios.push({ mode, passed: true, actualEchoObserved: true, abortedAndReloaded: aborted, chars: project.generatedStory.length, memoryRecords: project.memoryRecords.length, events })
  } catch (error) {
    report.scenarios.push({ mode, passed: false, error: String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]'), events })
    process.exitCode = 1
    persist(); break
  }
  persist()
}
report.passed = report.scenarios.length === 3 && report.scenarios.every(s => s.passed)
persist(); console.log(JSON.stringify({ report: path.join(output, 'report.json'), passed: report.passed, calls: paid, scenarios: report.scenarios }))
