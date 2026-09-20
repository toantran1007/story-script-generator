// Actual engine + real correction/gate API, with synthetic corrupt input only.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
import { bad, start, end } from './test-text-repetition.mjs'
const load = createLoader()
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { findTextRepetitions } = load('src/shared/textRepetition.ts')
const { hasTargetLanguageLeak } = load('src/renderer/src/services/languageGuard.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), settings = normalizeSettings(config.settings)
const output = path.resolve('live-text-repetition-20260920-combined')
fs.mkdirSync(output, { recursive: true })
const report = { syntheticOnly: true, corruptCharacters: 8587, model: settings.model, calls: [], checkpointsWithoutCorruptCommit: true }
let p = { ...createEmptyProject('repeat-live', 'Synthetic repetition check'), language: 'ja', duration: .05, enableHook: false, idea: 'Taro returns the warehouse key to the shelf. Hana checks the lock. Both see the sunset, cheer briefly, wave and return home. Preserve all these events and the ending.' }
p.outline = { title: '夕方の帰り道', outlineSummary: p.idea, chapters: [{ chapter: 1, title: '帰宅', summary: p.idea, estimatedWords: 100 }] }
p.longStory = { version: 1, cursor: 0, stage: 'write', attempt: 0, accepted: [], checkpoints: [], plan: { version: 1, inputKey: planInputKey(p), outline: p.outline, canon: [p.idea], duration: { requestedMinutes: .05, targetCharacters: 30, estimatedMinutes: .05 }, chapters: [{ chapter: 1, targetCharacters: 30, estimatedMinutes: .05, beats: ['Return key and lock warehouse', 'Brief cheer, wave, return home'], ending: 'Taro reads after dinner at home.' }] } }
let injected = false, calls = 0
const corrupt = bad.replace(end, '\n面白いwwwwwwww。\nThank you Taro. You saved the day.\nえ' + '?'.repeat(200) + end)
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
try {
  await runLongStory({ read: () => p, stopped: () => false, progress: message => console.log(message.slice(0, 180)), chat: async () => { throw Error('unexpected') },
    save: async patch => { p = structuredClone({ ...p, ...patch }); assert.equal(findTextRepetitions(p.generatedStory).length, 0); fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(p, null, 2)) },
    stream: async (messages, emit, options) => {
      if (messages[0].content.startsWith('Write literary')) {
        assert(!injected, 'must repair saved draft, not regenerate story'); injected = true
        emit(corrupt); return { text: corrupt, finishReason: 'stop' }
      }
      assert(++calls <= 6, 'Live request cap exceeded')
      const req = providerRequest(settings, messages, options, true), item = { call: calls, kind: messages[0].content.startsWith('INDEPENDENT') ? 'gate' : 'correction' }
      report.calls.push(item); save()
      const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000) })
      item.http = res.status; if (!res.ok) throw Error('HTTP ' + res.status)
      const response = await (usesResponses(settings) ? readResponsesStream : readChatStream)(res.body.getReader(), emit)
      fs.writeFileSync(path.join(output, `response-${calls}.json`), response.text)
      item.characters = response.text.length; save(); return response
    } })
  assert.equal(p.status, 'done')
  assert(p.generatedStory.startsWith(start)); assert(p.generatedStory.endsWith(end), 'surrounding plot and ending unchanged')
  assert.equal(findTextRepetitions(p.generatedStory).length, 0)
  assert(!hasTargetLanguageLeak(p.generatedStory, 'ja'))
  assert(!/[^\p{L}\p{M}\p{N}\s.,。、]/u.test(p.generatedStory))
  assert(!/w{3,}/iu.test(p.generatedStory))
  assert(/ありがとう|感謝/u.test(p.generatedStory), 'foreign gratitude must be translated, not discarded')
  assert.equal(p.memoryIssues.length, 0)
  // Reload saved checkpoint and verify persisted outcome, not only HTTP 200.
  const persisted = JSON.parse(fs.readFileSync(path.join(output, 'checkpoint.json'), 'utf8'))
  assert.equal(persisted.generatedStory, p.generatedStory)
  assert.equal(p.chapterDocuments[0].text, p.generatedStory)
  report.passed = true; report.finalText = p.generatedStory; report.memoryRecords = p.memoryRecords.length
} catch (error) {
  report.passed = false; report.error = String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]'); process.exitCode = 1
} finally { save(); console.log(JSON.stringify(report)) }
