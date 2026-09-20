// Real API calls through the actual store's hook action, synthetic stories only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createLoader } from './lib/load-local-ts.mjs'
import { harness } from './test-chapter-memory.mjs'
const load = createLoader()
const { normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { narrationChars } = load('src/renderer/src/services/textMetrics.ts')
const { authorEstimatedMinutes } = load('src/shared/narrationDuration.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings)
const output = path.resolve('live-narrative-hook-' + new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(output, { recursive: true })
const report = { model: settings.model, syntheticOnly: true, calls: [], results: [] }
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
let calls = 0
async function realChat(messages) {
  assert(++calls <= 6, 'Live request cap reached')
  const req = providerRequest(settings, messages, { maxTokens: 4000, temperature: .4 }, false)
  const item = { number: calls, model: settings.model }; report.calls.push(item); persist()
  const start = Date.now()
  try {
    const response = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000) })
    item.http = response.status
    if (!response.ok) throw Error('HTTP ' + response.status)
    const json = await response.json()
    const raw = usesResponses(settings) ? responseText(json) : readChatResponse(json)
    fs.writeFileSync(path.join(output, `response-${calls}.json`), raw)
    item.chars = raw.length
    return raw
  } finally { item.seconds = Math.round((Date.now() - start)/1000); console.log(JSON.stringify(item)); persist() }
}
for (const [language, file] of [['en', 'live-long-story-en-20260916/live-en.txt'], ['th', 'live-long-story-th-20260916/live-th.txt']]) {
  const source = fs.readFileSync(file, 'utf8')
  const app = harness([], [realChat, realChat, realChat], 'new')
  app.store.setState({ projects: [{ ...app.project, language, status: 'done', outlinePhase: 'done', generatedStory: source, enableHook: true, hookText: '' }] })
  await app.store.getState().regenerateHook()
  const p = app.store.getState().getActiveProject(), error = app.store.getState().getActiveRuntime().error
  const result = { language, passed: Boolean(p.hookText) && !error, chars: narrationChars(p.hookText, language), estimatedMinutes: authorEstimatedMinutes(narrationChars(p.hookText, language), language), requests: app.chatCalls.length, rewritten: Boolean(p.hookText) && !source.includes(p.hookText), storyUnchanged: p.generatedStory === source, error }
  report.results.push(result); fs.writeFileSync(path.join(output, language + '-hook.txt'), p.hookText); persist()
  assert.equal(p.generatedStory, source)
  if (!result.passed) process.exitCode = 1
}
report.passed = report.results.every(r => r.passed && r.rewritten && r.storyUnchanged)
persist(); console.log(JSON.stringify({ report: path.join(output, 'report.json'), ...report }))
if (!report.passed) process.exitCode = 1
