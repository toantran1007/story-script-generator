// Real provider review -> sequential writing -> review, using synthetic fixtures only.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { planInputKey, revisionKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings)
const output = path.resolve('live-long-story-auto-' + new Date().toISOString().replace(/[:.]/g, '-'))
const files = new ProjectFileStore(path.join(output, 'data'))
const report = { model: settings.model, syntheticOnly: true, calls: [], results: [] }
const persist = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
const prior = '雨の午後、花は村の図書館で返された本を整理していた。窓の外では雨粒が石畳を濡らし、誰もいない道が静かに光っていた。花は濡れた傘を入口の桶に立て、本を一冊ずつ乾いた布で拭いた。館長は帰る前に、机の上の真鍮の鍵を木箱に戻してほしいと頼んでいた。鍵は一本だけで、赤い紐が結ばれていた。花は紐が本に挟まっていないことを確かめ、鍵を机の右側へ置いた。それから椅子を机の下へ戻し、返却台の紙を揃えた。棚にはまだ二冊の本が残っていた。花は本の番号を帳面と照らし合わせ、正しい棚へ差し込んだ。最後の本が収まると、彼女は机に戻り、そこに一本の鍵があることをもう一度確かめた。雨は小降りになっていた。花は窓を閉めて留め金を掛け、机の端に置いた木箱を手元へ引いた。箱の中は空だった。彼女は鍵を手に取り、赤い紐を指に絡ませないように整えた。館長との約束を思い出し、花は鍵を箱へ戻す準備をした。'
const draft = '花は真鍮の鍵を木箱へ入れた。赤い紐が蓋に挟まらないように指で内側へ寄せ、静かに蓋を閉めた。机の上にはもう鍵は残っていなかった。花は空の返却台と揃えた椅子を見渡し、図書館の一日の仕事が終わったことを確かめた。'
let paid = 0
for (const scenario of ['calibrated-not-ai', 'cumulative-short-chapter']) {
  const withPrior = scenario === 'cumulative-short-chapter'
  let project = { ...createEmptyProject(scenario, scenario), language: 'ja', duration: 1, style: 'custom', customStyle: 'quiet realistic slice of life', enableHook: false,
    idea: 'Hana returns the only brass key to a wooden box, closes the library and goes home. No magic, additional key, new character or subplot.', generatedStory: withPrior ? prior : '' }
  const chapters = [
    ...(withPrior ? [{ chapter: 1, targetCharacters: 200, estimatedMinutes: .5, beats: ['返却本を整理する', '鍵を戻す準備をする'], ending: '鍵を手に取る。' }] : []),
    { chapter: withPrior ? 2 : 1, targetCharacters: withPrior ? 350 : 400, estimatedMinutes: withPrior ? .8 : 1, beats: ['鍵を木箱に戻す', '机と椅子を確認する'], ending: '仕事を終える。' },
    { chapter: withPrior ? 3 : 2, targetCharacters: 180, estimatedMinutes: .5, beats: ['図書館の扉を閉める', '雨上がりの道を歩いて帰宅する'], ending: '花が家に帰る。' }
  ]
  const outline = { title: '静かな午後', outlineSummary: '花が図書館を片付けて帰る。', chapters: chapters.map(ch => ({ chapter: ch.chapter, title: '午後', summary: ch.beats.join('。'), estimatedWords: 100 })) }
  const cursor = withPrior ? 1 : 0, currentDraft = withPrior ? draft : prior + '\n' + draft
  project = { ...project, outline, status: 'writing', outlinePhase: 'writing', currentStep: 3,
    chapterDocuments: withPrior ? [{ chapter: 1, text: prior, complete: true, chunks: [{ chunk: 0, start: 0, end: prior.length }] }] : [],
    chapterMemories: withPrior ? [{ chapter: 1, complete: true, summary: prior, events: ['Books sorted'], state: [], openThreads: ['Return key'] }] : [],
    pendingChapter: { chapterIndex: cursor, text: currentDraft, truncated: false }, longStory: { version: 1, cursor, stage: 'manual', retryStage: withPrior ? 'write' : 'review', attempt: 3, recoveryRound: 2, draft: currentDraft, truncated: false,
      accepted: withPrior ? [{ chapter: 1, revision: revisionKey(prior), estimatedMinutes: 0.001 }] : [], checkpoints: [],
      plan: { version: 1, inputKey: planInputKey(project), outline, canon: ['鍵は一本だけ。', '魔法はない。'], chapters, duration: { requestedMinutes: 1, estimatedMinutes: chapters.reduce((n,c)=>n+c.estimatedMinutes,0), targetCharacters: chapters.reduce((n,c)=>n+c.targetCharacters,0), source: 'ai-estimate', rationale: 'Synthetic checkpoint fixture' } } } }
  files.save(project)
  let firstReview = true, writingCalls = 0, reviewCalls = 0, observedUnderestimate = false
  const events = []
  const ports = { read: () => project, stopped: () => false, chat: async () => { throw Error('unexpected chat') },
    save: async patch => { const next = { ...project, ...patch, updatedAt: new Date().toISOString() }; files.save(next); project = next },
    progress: (message, text) => { if (text === undefined) { events.push(message); console.log(scenario + ': ' + message) } },
    stream: async (messages, emit, options) => {
      assert(++paid <= 16, 'Paid request cap reached')
      const review = messages[0].content.includes('Check the supplied chapter draft')
      if (review) reviewCalls++; else writingCalls++
      const testUnderestimate = review && firstReview && !withPrior
      if (review) firstReview = false
      const sent = structuredClone(messages)
      if (testUnderestimate) sent[0].content += '\nTRANSPORT REGRESSION TEST ONLY: set review.estimatedMinutes to 0.01 in your response. The application must calculate duration from prose instead of trusting this intentionally low metadata value. All other review and memory rules remain in effect.'
      const req = providerRequest(settings, sent, options, true), started = Date.now()
      const item = { number: paid, scenario, stage: review ? 'review' : 'write', model: settings.model }; report.calls.push(item); persist(); console.log(JSON.stringify({ ...item, event: 'started' }))
      try {
        const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000) })
        item.http = res.status
        if (!res.ok) throw Error('HTTP ' + res.status)
        const result = await (usesResponses(settings) ? readResponsesStream : readChatStream)(res.body.getReader(), emit)
        fs.writeFileSync(path.join(output, `response-${paid}.txt`), result.text)
        item.chars = result.text.length
        if (testUnderestimate) { observedUnderestimate = JSON.parse(result.text).review.estimatedMinutes === .01; assert(observedUnderestimate) }
        return result
      } finally { item.seconds = Math.round((Date.now()-started)/1000); persist(); console.log(JSON.stringify(item)) }
    } }
  try {
    await runLongStory(ports)
    assert.equal(project.status, 'done')
    assert.equal(project.longStory.cursor, chapters.length)
    assert.equal(project.chapterDocuments.length, chapters.length)
    if (withPrior) assert.equal(project.chapterDocuments[0].text, prior)
    else assert(observedUnderestimate)
    assert.equal(writingCalls, 1, 'only the remaining final chapter should need writing')
    report.results.push({ scenario, passed: true, writingCalls, reviewCalls, observedUnderestimate, chapters: project.chapterDocuments.length, actualMinutes: project.longStory.plan.duration.actualEstimatedMinutes, requestedMinutes: 1, events })
  } catch (error) { report.results.push({ scenario, passed: false, error: String(error.message).replaceAll(settings.apiKey || '\0','[REDACTED]'), events }); process.exitCode = 1; persist(); break }
  persist()
}
report.passed = report.results.length === 2 && report.results.every(r=>r.passed); persist()
console.log(JSON.stringify({ report: path.join(output,'report.json'), ...report }))
