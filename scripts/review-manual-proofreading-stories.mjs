// Real LLM review of the two explicitly requested synthetic 20-minute manuscripts.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { CHAPTER_CORRECTION_CONTRACT, applyChapterCorrection, chapterReferenceContext, correctionRetryFeedback } = load('src/renderer/src/services/chapterCorrection.ts')
const { assertNativeProofread, nativeProofreadPrompt } = load('src/renderer/src/services/languageIntegrity.ts')
const { numberedDraft } = load('src/renderer/src/services/sentenceEvidence.ts')
const { applyMemoryPayload } = load('src/renderer/src/services/detailedMemory.ts')
const { hasTargetLanguageLeak } = load('src/renderer/src/services/languageGuard.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const { nativeReviewMessages, assertNativeReviewGate } = load('src/renderer/src/services/nativeReviewGate.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), settings = normalizeSettings(config.settings)
const root = path.resolve(config.projectDataRoot || 'data')
assert.equal(root.toLowerCase(), path.resolve('data').toLowerCase())
const run = process.argv[3] || 'v2'
assert(/^[a-z0-9-]+$/.test(run))
const output = path.resolve('reviewed-proofreading-20min-' + run)
fs.mkdirSync(output, { recursive: true })
const report = { model: settings.model, answerKeySentToLLM: false, results: [], calls: [] }
let calls = 0
const saveReport = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
async function live(messages, label) {
  assert(++calls <= 50, 'Bounded request cap exceeded')
  const req = providerRequest(settings, messages, { maxTokens: 14000, temperature: .2 }, false)
  const item = { ...label, started: new Date().toISOString() }; report.calls.push(item); saveReport()
  const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000) })
  item.http = res.status; saveReport()
  if (!res.ok) throw Error('HTTP ' + res.status)
  const data = await res.json(), raw = usesResponses(settings) ? responseText(data) : readChatResponse(data)
  item.characters = raw.length; saveReport()
  return raw
}
const parse = raw => JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1'))
async function review(language) {
  const sourceFile = path.join(root, 'projects', `manual-proofread-20min-${language}-20260919`, 'project.json')
  const sourceBytes = fs.readFileSync(sourceFile), original = JSON.parse(sourceBytes).project
  assert.equal(original.language, language)
  const id = `reviewed-proofread-20min-${language}-20260919-${run}`
  assert(!fs.existsSync(path.join(root, 'projects', id)), 'Refusing to overwrite an existing review project')
  let project = { ...original, id, name: `TEST ${language === 'ja' ? 'NHẬT' : 'THÁI'} 20P — HẬU KIỂM ${run.toUpperCase()}`, generatedStory: '', chapterDocuments: [], chapterMemories: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], storyMemory: null,
    storyNotes: 'Bản chạy hậu kiểm LLM của kịch bản thử nghiệm; xem báo cáo lỗi còn sót, không mặc định hoàn hảo.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storageEpoch: 0 }
  const chapterResults = []
  for (const doc of original.chapterDocuments) {
    const draft = doc.text, file = path.join(output, `${language}-chapter-${doc.chapter}-response.json`)
    let feedback = '', accepted = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = attempt === 1 && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : await live([
          { role: 'system', content: CHAPTER_CORRECTION_CONTRACT + '\n' + nativeProofreadPrompt(language) },
          { role: 'user', content: JSON.stringify({ language, premise: original.idea, approvedOutline: original.outline, currentChapter: original.outline.chapters[doc.chapter - 1], prior: chapterReferenceContext(project, doc.chapter, draft), draft, sentences: numberedDraft(draft), feedback }) }
        ], { language, chapter: doc.chapter, attempt, stage: 'correction' })
        fs.writeFileSync(file, raw)
        const value = parse(raw); assertNativeProofread(value, language)
        const corrected = applyChapterCorrection(draft, raw)
        assert(!hasTargetLanguageLeak(corrected.text, language), 'Language leakage')
        assert(corrected.text.length >= draft.length * .85, 'Correction deleted too much prose')
        const memory = applyMemoryPayload(project, doc.chapter, 0, true, corrected.text, corrected.memory)
        const gateFile = path.join(output, `${language}-chapter-${doc.chapter}-gate-${attempt}.json`)
        const gate = await live(nativeReviewMessages(project, doc.chapter, { text: corrected.text, original: draft, edits: value.edits }), { language, chapter: doc.chapter, attempt, stage: 'native-gate' })
        fs.writeFileSync(gateFile, gate)
        assertNativeReviewGate(gate, project, corrected.text)
        project = { ...project, ...memory, generatedStory: [project.generatedStory, corrected.text].filter(Boolean).join('\n\n') }
        chapterResults.push({ chapter: doc.chapter, edits: value.edits, review: value.languageReview })
        fs.writeFileSync(path.join(output, `${language}-chapter-${doc.chapter}-corrected.txt`), corrected.text)
        console.log(JSON.stringify({ language, chapter: doc.chapter, accepted: true, edits: value.edits.length }))
        accepted = true; break
      } catch (error) {
        feedback = error instanceof SyntaxError ? correctionRetryFeedback(error) : String(error.message).replaceAll(settings.apiKey || '\0', '[REDACTED]')
        console.log(JSON.stringify({ language, chapter: doc.chapter, attempt, error: feedback.slice(0, 800) }))
        if (attempt === 3) throw error
      }
    }
    assert(accepted)
  }
  const text = project.generatedStory
  // Answer key is used ONLY after the blind review, never as a correction prompt.
  const key = JSON.parse(fs.readFileSync(`manual-proofreading-20min/${language}-ANSWER-KEY.json`, 'utf8'))
  const checks = key.answers.map((a, i) => ({ number: i + 1, ...a, result: text.includes(a.wrong) ? 'unchanged_wrong_span' : text.includes(a.correct) ? 'exact_reference_match' : 'changed_needs_semantic_check' }))
  const controls = key.mustPreserve.map(sentence => ({ sentence, unchanged: text.includes(sentence) }))
  fs.writeFileSync(path.join(output, `${language}-20min-REVIEWED.txt`), text)
  const auditFile = path.join(output, `${language}-independent-audit.json`)
  const auditRaw = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : await live([
    { role: 'system', content: `Act as an independent native-language copy editor. Read the entire corrected manuscript in context. Do NOT assume an earlier review was successful. Return JSON {"issues":[{"quote":"exact problematic span","suggestion":"minimal proposed repair","reason":"why it is genuinely wrong in context","severity":"error or style"}]}. Flag remaining spelling/homophone/segmentation errors and changed meaning. Do not flag valid variants as errors. No rewrite. Report uncertainty honestly. This is an evaluation only.` },
    { role: 'user', content: JSON.stringify({ language, premise: original.idea, outline: original.outline, manuscript: text }) }
  ], { language, stage: 'independent-audit' })
  fs.writeFileSync(auditFile, auditRaw)
  const audit = parse(auditRaw)
  assert(Array.isArray(audit.issues), 'Invalid independent audit')
  const result = { language, id, name: project.name, timing: estimateWrittenDuration(project), chapters: chapterResults, checks, controls, independentAudit: audit,
    counts: { plantedSpans: checks.length, exactMatches: checks.filter(c => c.result === 'exact_reference_match').length, unchangedWrong: checks.filter(c => c.result === 'unchanged_wrong_span').length, needsSemanticCheck: checks.filter(c => c.result === 'changed_needs_semantic_check').length, controlsKept: controls.filter(c => c.unchanged).length } }
  report.results.push(result); saveReport()
  project.storyNotes += `\nKết quả đối chiếu: ${JSON.stringify(result.counts)}. Audit độc lập báo ${audit.issues.length} mục cần xem, không coi tất cả là lỗi chắc chắn.`
  new ProjectFileStore(root).save(project)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'projects', id, 'project.json'), 'utf8')).project.generatedStory, text)
  assert(sourceBytes.equals(fs.readFileSync(sourceFile)), 'Original was modified')
  console.log(JSON.stringify({ language, ...result.counts, independentAudit: audit.issues, projectSaved: id }))
}
await Promise.all(['ja', 'th'].map(review))
