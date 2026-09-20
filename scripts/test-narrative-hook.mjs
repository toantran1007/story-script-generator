import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
import { harness } from './test-chapter-memory.mjs'
const load = createLoader()
const { parseNarrativeHook } = load('src/renderer/src/services/narrativeHook.ts')
const { plainNarration } = load('src/shared/plainNarration.ts')
const { buildPostStoryHookPrompt } = load('src/renderer/src/services/promptEngine.ts')
const source = 'The only key lay in the locked library. Hana reached for it before the rain damaged the books.'
const hook = 'One key, a locked library, and rain threatening the books. Hana had to reach it before the water did.'
const raw = JSON.stringify({ sourceExcerpt: source, hook })
assert.equal(parseNarrativeHook(source, raw, 200, 'en'), hook)
assert(!source.includes(hook), 'rewritten hooks are deliberately allowed')
assert.throws(() => parseNarrativeHook(source, JSON.stringify({ hook, sourceExcerpt: 'An invented bomb explodes.' }), 200, 'en'), /sourceExcerpt/)
assert.throws(() => parseNarrativeHook(source, JSON.stringify({ sourceExcerpt: source, hook: hook.slice(0, -1) }), 200, 'en'), /giữa câu/)
const ja = '雨の夜、花は図書館に残された本を守ろうとしていた。'
const jaHook = '雨が窓を叩く夜、花は残された本を見つめた。守れるのは今だけだ。彼女は静かに言った。「私がここに残る」'
assert.equal(parseNarrativeHook(ja, JSON.stringify({ sourceExcerpt: ja, hook: jaHook }), 100, 'ja'), plainNarration(jaHook))
const th = 'ฝนเริ่มตกหนักในขณะที่มาลียืนอยู่หน้าประตูห้องสมุด'
const thaiHook = 'ฝนเริ่มตกหนัก แต่มาลียังยืนอยู่หน้าประตูห้องสมุด เธอต้องหาทางปกป้องหนังสือก่อนที่น้ำจะไหลเข้ามา ทุกวินาทีมีความหมาย'
assert.equal(parseNarrativeHook(th, JSON.stringify({ sourceExcerpt: th, hook: thaiHook }), 180, 'th'), thaiHook)
assert.throws(() => parseNarrativeHook(ja, JSON.stringify({ sourceExcerpt: ja, hook: jaHook.slice(0, -1) + '。' }), 100, 'ja'), /ngoặc thoại/)
const prompt = buildPostStoryHookPrompt(source, 'dramatic', 'en', 200)
assert(prompt.system.includes('summarize and REWRITE'))
assert(!prompt.system.includes('Copy it VERBATIM'))
assert(prompt.system.includes('Do not reveal the final resolution'))

let app = harness([], ['{invalid', raw], 'new')
app.store.setState({ projects: [{ ...app.project, status: 'done', generatedStory: source, language: 'en', enableHook: true,
  longStory: undefined }], activeProjectId: app.project.id })
// Real budget for English is about 654 chars; use a ~400-char synthetic hook.
const budgetHook = hook + ' ' + 'Hana searched the library as the rain kept falling. '.repeat(6)
const budgetRaw = JSON.stringify({ sourceExcerpt: source, hook: budgetHook.trim() })
app = harness([], ['{invalid', budgetRaw], 'new')
app.store.setState({ projects: [{ ...app.project, status: 'done', generatedStory: source, language: 'en', enableHook: true }] })
await app.store.getState().regenerateHook()
assert.equal(app.chatCalls.length, 2)
assert(app.chatCalls[1][1].content.includes('LOCAL VALIDATION FAILED'))
assert.equal(app.store.getState().getActiveProject().generatedStory, source)
assert.equal(app.store.getState().getActiveProject().hookText, budgetHook.trim())
assert.equal(app.store.getState().getActiveRuntime().error, null)
app = harness([], ['{}', '{}', '{}'], 'new')
app.store.setState({ projects: [{ ...app.project, status: 'done', generatedStory: source, language: 'en', enableHook: true }] })
await app.store.getState().regenerateHook()
assert.equal(app.chatCalls.length, 3)
assert.equal(app.store.getState().getActiveProject().status, 'done')
assert.equal(app.store.getState().getActiveProject().generatedStory, source)
assert(app.store.getState().getActiveRuntime().error)
console.log('PASS: rewritten grounded hooks, Japanese/Thai endings, feedback retry, bounded errors and unchanged story')
