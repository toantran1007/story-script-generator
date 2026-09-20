// Bounded real-provider check. Synthetic text only; does not load or modify projects.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
import { proofreadingCases } from './lib/proofreading-cases.mjs'
const load = createLoader()
const { normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { CHAPTER_CORRECTION_CONTRACT, applyChapterCorrection, correctionRetryFeedback } = load('src/renderer/src/services/chapterCorrection.ts')
const { assertNativeProofread, nativeProofreadPrompt } = load('src/renderer/src/services/languageIntegrity.ts')
const { numberedDraft } = load('src/renderer/src/services/sentenceEvidence.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings)
const report = { syntheticOnly: true, model: settings.model, calls: 0, results: [] }
for (const test of proofreadingCases) {
  assert(['ja', 'th'].includes(test.language), 'Live tests are authorized ONLY for Japanese and Thai')
  let feedback = '', passed = false
  for (let attempt = 1; attempt <= 2; attempt++) {
    const item = { language: test.language, attempt }; report.results.push(item)
    const messages = [{ role: 'system', content: CHAPTER_CORRECTION_CONTRACT + '\n' + nativeProofreadPrompt(test.language) },
      { role: 'user', content: JSON.stringify({ language: test.language, premise: test.premise, approvedScene: test.premise, draft: test.draft, sentences: numberedDraft(test.draft), feedback }) }]
    assert(++report.calls <= 4)
    const req = providerRequest(settings, messages, { maxTokens: 7000, temperature: .1 }, false)
    try {
      const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(120000)
      })
      item.http = res.status
      if (!res.ok) throw Error('HTTP ' + res.status)
      const data = await res.json(), raw = usesResponses(settings) ? responseText(data) : readChatResponse(data)
      const json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1'))
      assertNativeProofread(json, test.language)
      const corrected = applyChapterCorrection(test.draft, raw)
      item.edits = json.edits; item.corrected = corrected.text; item.languageReview = json.languageReview
      for (const term of test.required) assert(corrected.text.includes(term), 'Missing expected repair: ' + term)
      for (const phrase of test.preserved) assert(corrected.text.includes(phrase), 'Valid context changed: ' + phrase)
      item.passed = passed = true
    } catch (error) {
      item.passed = false; item.error = String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]').slice(0, 1000)
      feedback = error instanceof SyntaxError ? correctionRetryFeedback(error) : 'Previous output failed validation. Review the original text again without guessing or changing valid contextual wording.'
    }
    fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ language: item.language, attempt, http: item.http, passed: item.passed, error: item.error }))
    if (passed) break
  }
  if (!passed) process.exitCode = 1
}
report.passed = proofreadingCases.every(test => report.results.some(item => item.language === test.language && item.passed))
fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2))
