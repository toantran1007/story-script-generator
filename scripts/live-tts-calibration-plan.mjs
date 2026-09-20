// REAL provider planning smoke test. Synthetic premise only; no project content.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const { planningMessages, parsePlan, authorCharacterRange } = load('src/renderer/src/services/longStory/planner.ts')
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const base = normalizeSettings(config.settings)
const profiles = [base, normalizeSettings({ ...config.settings, apiProvider: 'vilao', apiBaseUrl: base.apiBaseUrl, model: 'gemini-3.8-flash' })]
const project = { ...createEmptyProject('calibration-live', 'Calibration live'), language: 'ja', duration: 90, style: 'custom', customStyle: 'grounded mystery', idea: 'A clockmaker investigates a village bell that rings early; the answer is a copied tide table, with no magic and a complete resolution.' }
const output = path.resolve(process.argv[3] || 'live-tts-calibration-20260917')
fs.mkdirSync(output, { recursive: true })
const report = { syntheticOnly: true, requestedMinutes: 90, calls: [] }
for (let index = 0; index < profiles.length; index++) {
  const settings = profiles[index]
  const request = providerRequest(settings, planningMessages(project), { maxTokens: 10000, temperature: 0.2 }, false)
  const item = { model: settings.model, provider: settings.apiProvider, endpoint: request.endpoint }
  report.calls.push(item)
  const started = Date.now()
  try {
    const response = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + request.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(request.body), signal: AbortSignal.timeout(180000)
    })
    item.http = response.status
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const raw = usesResponses(settings) ? responseText(data) : readChatResponse(data)
    item.responseChars = raw.length
    const plan = parsePlan(raw, project)
    const range = authorCharacterRange(90, 'ja')
    assert(plan.duration.targetCharacters >= range.min * 0.85, `target ${plan.duration.targetCharacters} is below the calibrated minimum`)
    item.targetCharacters = plan.duration.targetCharacters
    item.estimatedMinutes = plan.duration.estimatedMinutes
    item.chapterCount = plan.chapters.length
    item.passed = true
    report.plan = { targetCharacters: plan.duration.targetCharacters, estimatedMinutes: plan.duration.estimatedMinutes, chapterCount: plan.chapters.length }
    break
  } catch (error) {
    item.error = String(error.message).match(/\[API_[A-Z_]+\]/)?.[0] || error.name
    if (index === profiles.length - 1) report.error = String(error.message)
  } finally {
    item.seconds = Math.round((Date.now() - started) / 1000)
    console.log(JSON.stringify(item))
  }
}
report.passed = report.plan !== undefined
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
console.log(JSON.stringify(report))
