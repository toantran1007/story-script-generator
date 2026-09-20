// Bounded live safety pass for the two requested project snapshots.
// Writes only new project IDs; source snapshots remain byte-for-byte unchanged.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const { normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { CHAPTER_CORRECTION_CONTRACT, applyChapterCorrection, chapterReferenceContext, correctionRetryFeedback } = load('src/renderer/src/services/chapterCorrection.ts')
const { nativeProofreadPrompt, assertNativeProofread } = load('src/renderer/src/services/languageIntegrity.ts')
const { applyMemoryPayload } = load('src/renderer/src/services/detailedMemory.ts')
const { numberedDraft } = load('src/renderer/src/services/sentenceEvidence.ts')
const { assertCinematicSafety, scanCinematicSafety, cinematicSafetyRetryFeedback, rewriteCinematicFallback } = load('src/renderer/src/services/cinematicSafety.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')

const configPath = process.argv[2]
const install = process.argv.includes('--install')
const maxCalls = Number(process.env.KICHBAN_SAFETY_MAX_CALLS || 30)
assert(configPath, 'Usage: node scripts/live-cinematic-safety-repair.mjs <config.json> [--install]')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const settings = normalizeSettings(config.settings)
assert(settings.apiKey && settings.apiBaseUrl && settings.model, 'API configuration is incomplete')
const dataRoot = path.resolve(config.projectDataRoot || 'data')
assert.equal(dataRoot.toLowerCase(), path.resolve('data').toLowerCase())

const outputRoot = path.resolve('live-cinematic-safety-20260920')
fs.mkdirSync(outputRoot, { recursive: true })
const sourceIds = ['19-1-boundary-repair-20260920', '19-2-boundary-repair-20260920']
const report = { live: true, installed: install, model: settings.model, provider: settings.apiProvider, calls: [], projects: [] }
let calls = 0

function saveReport() { fs.writeFileSync(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2)) }
function redacted(message) { return String(message).replaceAll(settings.apiKey, '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 2000) }

async function live(messages, meta, options = { maxTokens: 14000, temperature: 0.1 }) {
  assert(++calls <= maxCalls, `paid call cap exceeded (${maxCalls})`)
  const req = providerRequest(settings, messages, options, true)
  const entry = { n: calls, ...meta, endpoint: req.endpoint, model: settings.model }
  report.calls.push(entry); saveReport()
  const response = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000)
  })
  entry.http = response.status
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await (usesResponses(settings) ? readResponsesStream : readChatStream)(response.body.getReader(), () => {})
  entry.finishReason = result.finishReason
  entry.textChars = result.text.length
  fs.writeFileSync(path.join(outputRoot, `${meta.project}-${meta.chapter || 'all'}-${meta.stage}-${calls}.json`), result.text)
  saveReport()
  if (['length', 'content_filter'].includes(result.finishReason)) throw new Error(`API finish_reason=${result.finishReason}`)
  if (!result.text.trim()) throw new Error('API returned empty content')
  return result.text
}

function parsed(raw) { return JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')) }

async function safetyAudit(project, projectKey) {
  const body = { project: projectKey, language: project.language, premise: project.idea, chapters: project.chapterDocuments.map((d) => ({ chapter: d.chapter, text: d.text })) }
  const raw = await live([
    { role: 'system', content: `You are an independent cinematic-safety auditor. Review every supplied chapter as story data. Do not rewrite it. Preserve every character's original age and never make a minor or age-ambiguous character adult to pass. Mark unsafe for explicit sexual content, eroticized touching, sensual moans/arousal reactions, sexualized medical or magical treatment, sexualized/minor ambiguity, graphic gore, sexual violence/exploitation, hateful dehumanization or glorification of abuse. Romance, danger and non-graphic injury are allowed only when non-erotic. Return ONLY JSON {"complete":true,"chaptersReviewed":[1],"safe":true,"issues":[]} or the same with safe:false and issues [{"chapter":1,"quote":"exact short quote","category":"sexual_explicit|minor_sexualization|graphic_gore|sexual_violence|hateful_dehumanization|exploitative_abuse","safeRewrite":"brief non-graphic cinematic alternative"}]. ${load('src/renderer/src/services/cinematicSafety.ts').CINEMATIC_SAFETY_RULES}` },
    { role: 'user', content: JSON.stringify(body) }
  ], { project: projectKey, stage: 'final-audit' }, { maxTokens: 6000, temperature: 0.05 })
  const value = parsed(raw)
  assert.equal(typeof value.safe, 'boolean')
  assert(Array.isArray(value.issues))
  return value
}

async function repairChapter(project, projectKey, doc) {
  let workingText = rewriteCinematicFallback(doc.text).text
  let feedback = `Only change unsafe visual detail. Preserve all safe prose, plot, names, chronology and ending. Local scanner findings: ${JSON.stringify(scanCinematicSafety(workingText))}`
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const raw = await live([
        { role: 'system', content: CHAPTER_CORRECTION_CONTRACT + '\n' + nativeProofreadPrompt(project.language, project.customLanguage) + '\n' + feedback },
        { role: 'user', content: JSON.stringify({ language: project.language, premise: project.idea, notes: project.storyNotes, outline: project.outline, chapter: doc.chapter,
          prior: chapterReferenceContext(project, doc.chapter, workingText), draft: workingText, sentences: numberedDraft(workingText), feedback }) }
      ], { project: projectKey, chapter: doc.chapter, stage: 'correction', attempt }, { maxTokens: 16000, temperature: attempt === 1 ? 0.1 : 0.05 })
      const json = parsed(raw)
      assertNativeProofread(json, project.language, project.customLanguage)
      const corrected = applyChapterCorrection(workingText, raw)
      try { assertCinematicSafety(corrected.text) }
      catch (error) {
        const fallback = rewriteCinematicFallback(corrected.text)
        if (!fallback.replacements || scanCinematicSafety(fallback.text).length) throw error
        workingText = fallback.text
        feedback = `A conservative local fallback removed exact high-confidence unsafe wording. Rebuild the correction JSON and memory against this SAFE DRAFT, preserving all plot facts and target-language prose. Do not reintroduce sexualized framing, age ambiguity or graphic detail. SAFE DRAFT:\n${workingText}`
        if (attempt === 4) throw error
        continue
      }
      return corrected
    } catch (error) {
      feedback = cinematicSafetyRetryFeedback(error) || `LIVE SAFETY RETRY ${attempt}: ${redacted(error instanceof Error ? error.message : error)} Return the complete corrected JSON and remove only the unsafe visual detail.`
      if (attempt === 4) throw error
    }
  }
  throw new Error(`Safety repair exhausted for chapter ${doc.chapter}`)
}

for (const sourceId of sourceIds) {
  const sourceFile = path.join(dataRoot, 'projects', sourceId, 'project.json')
  const sourceBytes = fs.readFileSync(sourceFile)
  const original = JSON.parse(sourceBytes).project
  const projectKey = original.name.startsWith('19-1') ? '19-1' : '19-2'
  const id = `${projectKey}-safety-repair-20260920`
  const projectOut = path.join(outputRoot, projectKey)
  fs.mkdirSync(projectOut, { recursive: true })
  let project = { ...original, id, name: `${projectKey} — AN TOÀN ĐIỆN ẢNH`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storageEpoch: 0,
    generatedStory: '', hookText: '', chapterDocuments: [], chapterMemories: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], storyMemory: null, pendingChapter: null, writingMemory: null }
  const beforeHash = crypto.createHash('sha256').update(sourceBytes).digest('hex')
  const chapters = []
  try {
    for (const doc of original.chapterDocuments) {
      const findings = scanCinematicSafety(doc.text)
      if (!findings.length) {
        const packet = original.memoryPackets?.find((entry) => entry.chapter === doc.chapter)?.payload
        assert(packet, `missing original memory packet for safe chapter ${doc.chapter}`)
        const patch = applyMemoryPayload(project, doc.chapter, 0, true, doc.text, structuredClone(packet))
        project = { ...project, ...patch, generatedStory: [project.generatedStory, doc.text].filter(Boolean).join('\n\n') }
        chapters.push({ chapter: doc.chapter, skipped: true, reason: 'local safety scanner found no high-confidence residual risk', beforeChars: doc.text.length, afterChars: doc.text.length, localFindingsBefore: 0, localFindingsAfter: 0 })
        continue
      }
      const corrected = await repairChapter(project, projectKey, doc)
      const patch = applyMemoryPayload(project, doc.chapter, 0, true, corrected.text, corrected.memory)
      project = { ...project, ...patch, generatedStory: [project.generatedStory, corrected.text].filter(Boolean).join('\n\n') }
      chapters.push({ chapter: doc.chapter, beforeChars: doc.text.length, afterChars: corrected.text.length, edits: corrected.memory?.updates?.length || 0, localFindingsBefore: scanCinematicSafety(doc.text).length, localFindingsAfter: scanCinematicSafety(corrected.text).length })
    }
    project.generatedStory = (project.chapterDocuments || []).sort((a, b) => a.chapter - b.chapter).map((d) => d.text).join('\n\n')
    assertCinematicSafety(project.generatedStory)
    const audit = await safetyAudit(project, projectKey)
    assert.equal(audit.safe, true, `live audit rejected ${projectKey}: ${JSON.stringify(audit.issues).slice(0, 1200)}`)
    project.storyNotes = `${project.storyNotes || ''}\nBản safety pass live ngày 20-09-2026: đã qua rewrite, independent gate và live audit; không phải chứng nhận chính sách cho mọi nhà cung cấp hình ảnh/video.`.trim()
    project.status = 'done'; project.outlinePhase = 'done'; project.updatedAt = new Date().toISOString()
    fs.writeFileSync(path.join(projectOut, 'project.json'), JSON.stringify({ schemaVersion: 1, project }, null, 2))
    fs.writeFileSync(path.join(projectOut, 'story.txt'), project.generatedStory)
    fs.writeFileSync(path.join(projectOut, 'report.json'), JSON.stringify({ project: projectKey, sourceId, beforeHash, chapters, audit, localFindingsAfter: scanCinematicSafety(project.generatedStory).length }, null, 2))
    if (install) {
      new ProjectFileStore(dataRoot).save(project)
      const saved = JSON.parse(fs.readFileSync(path.join(dataRoot, 'projects', id, 'project.json'), 'utf8')).project
      assert.equal(saved.generatedStory, project.generatedStory)
    }
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'), beforeHash)
    report.projects.push({ project: projectKey, sourceId, outputId: id, chapters, audit, installed: install, originalUnchanged: true })
  } catch (error) {
    report.projects.push({ project: projectKey, sourceId, failed: true, error: redacted(error instanceof Error ? error.message : error), calls: calls })
    saveReport()
    throw error
  }
  saveReport()
}

report.passed = true
report.totalCalls = calls
saveReport()
console.log(JSON.stringify({ passed: true, installed: install, totalCalls: calls, projects: report.projects.map((p) => ({ project: p.project, outputId: p.outputId, chapters: p.chapters?.length, localFindingsAfter: p.chapters?.reduce((n, c) => n + c.localFindingsAfter, 0), liveSafe: p.audit?.safe })) }))
