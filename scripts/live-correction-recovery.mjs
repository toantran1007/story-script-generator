// Explicit paid test. Sends synthetic Japanese text only; never loads user projects.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { harness } from './test-chapter-memory.mjs'

const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText)(module, module.exports, id => load(path.resolve(path.dirname(file), id + '.ts')))
  cache.set(file, module.exports)
  return module.exports
}
const { settings } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const { providerRequest, usesResponses, responseText } = load(path.resolve('src/main/responsesProvider.ts'))
const { readChatResponse } = load(path.resolve('src/main/chatResponse.ts'))
const draft = '太郎は村の倉庫で小麦の袋を数えた。\n袋は五つあった。\n彼はそのうち二つを荷車に積み、残りの三つを倉庫に置いた。\n「今日はこの二袋をパン屋へ運ぶ」と太郎は言った。\n花は空になった棚に札を付けた。\n二人は荷車を押して、村の広場へ向かった。\nパン屋の主人は二袋を受け取り、代金として銅貨六枚を渡した。\n太郎は銅貨を財布に入れ、花と一緒に空の荷車を倉庫へ戻した。\n倉庫には小麦の袋が三つ残っていた。\n花が帳面を閉じると、太郎は戸締まりを確かめた。'
const reports = []
let paidCalls = 0
async function live(messages) {
  assert(++paidCalls <= 4, 'paid request cap exceeded')
  const req = providerRequest(settings, messages, { maxTokens: 10000 }, false)
  const report = { call: paidCalls, model: settings.model, endpoint: req.endpoint, feedback: messages.some(m => m.content.includes('LOCAL VALIDATION FAILED:')) }
  reports.push(report)
  const started = Date.now()
  try {
    const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(req.body), signal: AbortSignal.timeout(180000)
    })
    report.http = res.status
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    const text = usesResponses(settings) ? responseText(data) : readChatResponse(data)
    report.chars = text.length
    return text
  } catch (err) {
    report.error = String(err.message).match(/\[API_[A-Z_]+\]/)?.[0] || err.name
    throw err
  } finally {
    report.seconds = Math.round((Date.now() - started) / 1000)
    console.log(JSON.stringify(report))
  }
}
try {
  for (const injectedFailure of [false, true]) {
    const invalid = JSON.stringify({ edits: [{ before: 'missing original substring', after: 'x' }], memory: {} })
    const app = harness([draft], [...(injectedFailure ? [invalid] : []), live, live], 'new')
    app.store.setState({ projects: [{ ...app.project, language: 'ja', idea: 'A village grain delivery.',
      outline: { title: 'Delivery', outlineSummary: 'Deliver two of five sacks, retain three.', chapters: [{ chapter: 1, title: 'Delivery', summary: 'Deliver grain and return.', estimatedWords: 500 }] }
    }] })
    await app.store.getState().confirmAndWrite()
    const p = app.store.getState().getActiveProject()
    const outcome = { injectedFailure, done: p.status === 'done', writingCalls: app.calls.length,
      correctionCalls: app.chatCalls.length, chapters: p.chapterMemories.length,
      draftCleared: !p.pendingChapter, memoryRecords: p.memoryRecords?.length || 0 }
    reports.push(outcome)
    console.log(JSON.stringify(outcome))
    assert(outcome.done, 'Live correction failed; see redacted call report')
    assert.equal(outcome.writingCalls, 1)
    assert.equal(outcome.chapters, 1)
    assert(outcome.draftCleared)
    assert(outcome.memoryRecords > 0)
    if (injectedFailure) assert(app.chatCalls[1][1].content.includes('LOCAL VALIDATION FAILED:'))
  }
} finally {
  fs.writeFileSync(process.argv[3], JSON.stringify({ syntheticOnly: true, paidCalls, reports }, null, 2))
}
