// REAL provider acceptance. Synthetic premises only; never reads user projects.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { planLongStory, runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const { exportStoryJSON } = load('src/shared/storyExport.ts')
const { formatStoryWithHook } = load('src/shared/storyFormatting.ts')
const { narrationChars } = load('src/renderer/src/services/textMetrics.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const settings = normalizeSettings(config.settings)
const output = path.resolve(process.argv[3] || 'live-long-story-acceptance')
fs.mkdirSync(output, { recursive: true })
const files = new ProjectFileStore(path.join(output, 'data'))
const reportFile = path.join(output, 'report.json')
const legacyProfile = config.settings.apiProfiles?.legacy
const fallbackSettings = legacyProfile?.apiBaseUrl && legacyProfile?.apiKey && legacyProfile?.model
  ? normalizeSettings({ ...config.settings, apiProvider: 'legacy', apiBaseUrl: legacyProfile.apiBaseUrl, apiKey: legacyProfile.apiKey, model: legacyProfile.model })
  : null
const remoteFallback = normalizeSettings({ ...config.settings, apiProvider: 'vilao', model: 'gemini-3.8-flash' })
const candidates = [settings, remoteFallback, ...(fallbackSettings ? [fallbackSettings] : [])]
let activeIndex = process.argv.includes('--fallback') ? 1 : 0
let activeSettings = candidates[activeIndex]
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : { syntheticOnly: true, model: settings.model, calls: [], results: [] }
for (const call of report.calls) if (!call.finishReason && !call.error) call.error = 'runner_interrupted_outcome_unknown'
const persist = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
const cases = [
  { id: 'live-ja', language: 'ja', duration: 85, genre: 'Quiet historical mystery, no magic', idea: 'A clock repairer and a widowed librarian investigate why the village archive bell rings at the wrong hour. The sole brass key cannot be duplicated. The library has no electricity and no supernatural forces exist. A miscopied tide table, not a villain or magic, explains the error. Resolve it through established evidence and end with the repaired public bell. Focus on grounded investigation, distinct voices and trust; no new conspiracy after the resolution.' },
  { id: 'live-en', language: 'en', duration: 8, genre: 'Contemporary family drama', idea: 'Two estranged adult sisters sort their late mother’s recipe notebook before returning a borrowed oven. Mira cannot read musical notation. The notebook contains only recipes, no secret inheritance. They reconcile through cooking a failed bread recipe together and return the oven; no magic or crime subplot.' },
  { id: 'live-th', language: 'th', duration: 8, genre: 'Light workplace comedy', idea: 'A small tea shop has twelve cups and no delivery service. A new employee and an older owner organize a rainy afternoon tasting for six neighbors, learning to cooperate. They wash and reuse cups but never acquire extra cups. The final event succeeds without magic, romance or a new crisis.' }
]
let paidThisRun = 0
async function request(messages, options, stream, emit = () => {}) {
  assert(++paidThisRun <= 65, 'Per-run paid request cap reached')
  const req = providerRequest(activeSettings, messages, options, stream)
  const item = { number: report.calls.length + 1, model: activeSettings.model, provider: activeSettings.apiProvider, streaming: stream, endpoint: req.endpoint, seconds: 0 }
  report.calls.push(item); persist()
  const started = Date.now()
  console.log(JSON.stringify({ request: item.number, stream, event: 'started' }))
  try {
    const res = await fetch(activeSettings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeSettings.apiKey}` },
      body: JSON.stringify(req.body), signal: AbortSignal.timeout(300000)
    })
    item.http = res.status
    item.contentType = res.headers.get('content-type')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const result = stream ? await (usesResponses(activeSettings) ? readResponsesStream : readChatStream)(res.body.getReader(), emit)
      : { text: usesResponses(activeSettings) ? responseText(await res.json()) : readChatResponse(await res.json()), finishReason: 'stop' }
    item.chars = result.text.length; item.finishReason = result.finishReason
    fs.writeFileSync(path.join(output, `response-${item.number}.txt`), result.text)
    return result
  } catch (error) {
    item.error = String(error.message).match(/\[API_[A-Z_]+\]/)?.[0] || error.name
    if (activeIndex < candidates.length - 1 && ['TimeoutError', '[API_EMPTY_CONTENT]', '[API_RESPONSE_ERROR]', '[API_OUTPUT_INCOMPLETE]', 'Error'].includes(item.error)) {
      const previous = activeSettings
      activeSettings = candidates[++activeIndex]
      report.fallback = { from: previous.model, to: activeSettings.model, reason: item.error, afterRequest: item.number }
    }
    throw error
  } finally { item.seconds = Math.round((Date.now() - started) / 1000); persist(); console.log(JSON.stringify(item)) }
}
for (const test of cases) {
  const requestedCase = process.argv.slice(4).find(value => cases.some(item => item.id === value))
  if (requestedCase && requestedCase !== test.id) continue
  if (report.results.some(r => r.id === test.id && r.passed)) continue
  let project = files.list().find(p => p.id === test.id) || { ...createEmptyProject(test.id, test.id), language: test.language, duration: test.duration, style: 'custom', customStyle: test.genre, idea: test.idea, enableHook: false }
  files.save(project)
  let stop = false, pauseDone = Boolean(project.longStory?.accepted.length), lastMessage = ''
  const ports = {
    read: () => project, stopped: () => stop,
    save: async patch => {
      const next = { ...project, ...patch, updatedAt: new Date().toISOString() }; files.save(next); project = next
      if (test.id === 'live-ja' && project.longStory?.cursor === 1 && !pauseDone) { pauseDone = true; stop = true }
    },
    chat: async (messages, options) => (await request(messages, options, false)).text,
    stream: (messages, emit, options) => request(messages, options, true, emit),
    progress: (message, text) => { if (text === undefined && message !== lastMessage) { console.log(test.id + ': ' + message); lastMessage = message } }
  }
  try {
    await planLongStory(ports)
    try { await runLongStory(ports) } catch (error) { if (!stop) throw error }
    if (stop) {
      const firstChapter = project.chapterDocuments[0].text
      project = files.list().find(p => p.id === test.id)
      assert.equal(project.chapterDocuments[0].text, firstChapter)
      stop = false
      report.pauseResume = { persisted: true, completedChapters: project.longStory.cursor }
      persist()
      await runLongStory(ports)
      assert.equal(project.chapterDocuments[0].text, firstChapter, 'resume rewrote accepted chapter')
    }
    assert.equal(project.status, 'done')
    assert.equal(project.chapterDocuments.length, project.longStory.plan.chapters.length)
    assert(project.memoryRecords.length > 0)
    const json = exportStoryJSON(project)
    assert.equal(JSON.parse(json).generatedStory, project.generatedStory)
    fs.writeFileSync(path.join(output, test.id + '.json'), json)
    fs.writeFileSync(path.join(output, test.id + '.txt'), formatStoryWithHook(project.generatedStory, project.hookText, project.language))
    const chars = narrationChars(project.generatedStory, project.language), target = project.longStory.plan.duration.targetCharacters
    assert(chars >= target * 0.85)
    const result = { id: test.id, passed: true, chapters: project.chapterDocuments.length, chars, target, requestedMinutes: test.duration, aiEstimatedMinutes: project.longStory.accepted.reduce((n, c) => n + c.estimatedMinutes, 0), memoryRecords: project.memoryRecords.length, memoryIssues: project.memoryIssues?.length || 0 }
    report.results = report.results.filter(r => r.id !== test.id); report.results.push(result); persist(); console.log(JSON.stringify(result))
  } catch (error) {
    report.results = report.results.filter(r => r.id !== test.id)
    report.results.push({ id: test.id, passed: false, error: String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]').replaceAll(fallbackSettings?.apiKey || '\0', '[REDACTED]') })
    persist(); console.log(JSON.stringify(report.results.at(-1))); process.exitCode = 1; break
  }
}
