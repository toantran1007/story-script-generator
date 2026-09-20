// Explicit project-scoped repair. Original files never written.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { CHAPTER_CORRECTION_CONTRACT, applyChapterCorrection, chapterReferenceContext, correctionRetryFeedback } = load('src/renderer/src/services/chapterCorrection.ts')
const { nativeProofreadPrompt, assertNativeProofread } = load('src/renderer/src/services/languageIntegrity.ts')
const { nativeReviewMessages, assertNativeReviewGate } = load('src/renderer/src/services/nativeReviewGate.ts')
const { repetitionRepairContext, findTextRepetitions } = load('src/shared/textRepetition.ts')
const { hasTargetLanguageLeak } = load('src/renderer/src/services/languageGuard.ts')
const { numberedDraft } = load('src/renderer/src/services/sentenceEvidence.ts')
const { applyMemoryPayload } = load('src/renderer/src/services/detailedMemory.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), settings = normalizeSettings(config.settings)
const root = path.resolve(config.projectDataRoot || 'data'); assert.equal(root.toLowerCase(), path.resolve('data').toLowerCase())
const source = path.join(root, 'projects/08449e0f-3ac2-4a58-bbe8-76cd36176eb3/project.json'), bytes = fs.readFileSync(source), original = JSON.parse(bytes).project
assert.equal(original.name, '19-1')
const id = '19-1-integrity-repaired-20260920', out = path.resolve('repair-19-1-20260920')
assert(!fs.existsSync(path.join(root, 'projects', id)), 'Refuse overwrite')
fs.mkdirSync(out, { recursive: true })
let project = { ...original, id, name: '19-1 — BẢN SỬA LẶP VÀ KÝ HIỆU', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storageEpoch: 0,
  generatedStory: '', hookText: '', enableHook: false, longStory: undefined, pendingChapter: null, writingMemory: null, writingEngine: 'chapter-v2',
  chapterDocuments: [], chapterMemories: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], storyMemory: null }
const report = { sourceId: original.id, model: settings.model, calls: [], chapters: [], originalUnchanged: false }
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
let calls = 0
async function live(messages, chapter, stage, attempt) {
  assert(++calls <= 30, 'paid call cap')
  const req = providerRequest(settings, messages, { maxTokens: 14000, temperature: .1 }, true)
  const item = { chapter, stage, attempt }; report.calls.push(item); save()
  const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000) })
  item.http = res.status; if (!res.ok) throw Error('HTTP ' + res.status)
  const result = await (usesResponses(settings) ? readResponsesStream : readChatStream)(res.body.getReader(), () => {})
  assert(!['length','content_filter'].includes(result.finishReason), 'Incomplete response')
  fs.writeFileSync(path.join(out, `${chapter}-${stage}-${attempt}.json`), result.text); save()
  return result.text
}
try {
  for (const doc of original.chapterDocuments) {
    let feedback = repetitionRepairContext(doc.text), accepted = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await live([{ role: 'system', content: CHAPTER_CORRECTION_CONTRACT + '\n' + nativeProofreadPrompt('ja') + '\n' + repetitionRepairContext(doc.text) },
          { role: 'user', content: JSON.stringify({ language: 'ja', premise: original.idea, notes: original.storyNotes, outline: original.outline, chapter: doc.chapter,
            prior: chapterReferenceContext(project, doc.chapter, doc.text), draft: doc.text, sentences: numberedDraft(doc.text), feedback }) }], doc.chapter, 'correction', attempt)
        const json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1'))
        assertNativeProofread(json, 'ja')
        const corrected = applyChapterCorrection(doc.text, raw)
        assert(!hasTargetLanguageLeak(corrected.text, 'ja'), 'Foreign sentence remains')
        assert(!/[^\p{L}\p{M}\p{N}\s.,。、]/u.test(corrected.text), 'Forbidden symbol remains')
        const memory = applyMemoryPayload(project, doc.chapter, 0, true, corrected.text, corrected.memory)
        const gate = await live(nativeReviewMessages(project, doc.chapter, { text: corrected.text, original: doc.text, edits: json.edits }), doc.chapter, 'gate', attempt)
        assertNativeReviewGate(gate, project, corrected.text)
        project = { ...project, ...memory, generatedStory: [project.generatedStory, corrected.text].filter(Boolean).join('\n\n') }
        report.chapters.push({ chapter: doc.chapter, beforeChars: doc.text.length, afterChars: corrected.text.length, beforeRepetitions: findTextRepetitions(doc.text), afterRepetitions: findTextRepetitions(corrected.text), edits: json.edits })
        fs.writeFileSync(path.join(out, 'checkpoint.json'), JSON.stringify(project, null, 2)); save()
        console.log(JSON.stringify({ chapter: doc.chapter, accepted: true, edits: json.edits.length, afterChars: corrected.text.length })); accepted = true; break
      } catch (e) {
        feedback = e instanceof SyntaxError ? correctionRetryFeedback(e) : String(e.message)
        console.log(JSON.stringify({ chapter: doc.chapter, attempt, error: feedback.slice(0, 250) }))
        if (attempt === 3) throw e
      }
    }
    assert(accepted)
  }
  project.status = 'done'; project.outlinePhase = 'done'; project.durationIssue = null
  new ProjectFileStore(root).save(project)
  fs.writeFileSync(path.join(out, '19-1-CLEAN.txt'), project.generatedStory)
  assert(bytes.equals(fs.readFileSync(source)))
  const stored = JSON.parse(fs.readFileSync(path.join(root, 'projects', id, 'project.json'), 'utf8')).project
  assert.equal(stored.generatedStory, project.generatedStory)
  assert.equal(stored.chapterDocuments.map(c => c.text).join('\n\n'), stored.generatedStory)
  report.originalUnchanged = true; report.passed = true; report.projectId = id; report.timing = estimateWrittenDuration(project)
} catch(e) { report.passed = false; report.error = String(e.message).replaceAll(settings.apiKey || '\0', '[REDACTED]').slice(0, 1500); process.exitCode = 1 }
save(); console.log(JSON.stringify({ passed: report.passed, calls: report.calls.length, chapters: report.chapters.length, error: report.error }))
