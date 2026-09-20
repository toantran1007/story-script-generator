import assert from 'node:assert/strict'
import path from 'node:path'
import { harness } from './test-chapter-memory.mjs'
const text = n => '猫'.repeat(n)
const correction = JSON.stringify({ edits: [], languageReview: { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }, memory: { chapter: { summary: 'Cat rests.', events: [], state: [], openThreads: [] }, updates: [
  { id: 'cat', kind: 'character', subject: 'cat', text: 'Cat rests.', status: 'current', importance: 'normal', related: [], evidence: text(100) }
] } })
function setup(responses, chats) {
  const a = harness(responses, chats, 'new', true, true)
  a.store.setState({ projects: [{ ...a.project, language: 'ja', duration: 1, readingSpeed: 100, outline: { ...a.project.outline, chapters: a.project.outline.chapters.slice(0, 1) } }] })
  return a
}
let app = setup([text(30), text(40), text(50), text(100)], [correction])
await app.store.getState().confirmAndWrite()
assert.equal(app.store.getState().getActiveProject().status, 'done')
assert.equal(app.calls.length, 4)
assert(app.calls[3][1].content.includes(text(50)))
assert.equal(app.chatCalls.length, 1)
assert(app.store.getState().getActiveRuntime().logs.some(l => l.message.includes('phục hồi lần 2/3')))
app = setup(Array(9).fill(text(30)), [])
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 9)
assert.match(app.store.getState().getActiveRuntime().error, /đã tự chạy lại 2 lần/)
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, text(30))
app = setup([text(100)], [...Array(3).fill(new Error('API unavailable')), correction])
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1)
assert.equal(app.chatCalls.length, 4)
assert.equal(app.store.getState().getActiveProject().status, 'done')
app = setup(['CANCEL'], [])
await app.store.getState().confirmAndWrite()
assert.equal(app.calls.length, 1)
assert.equal(app.store.getState().getActiveRuntime().error, null)
app = setup([text(100)], [correction])
let saves = 0
window.api.saveProject = async p => { if (!p.pendingChapter && ++saves <= 3) throw new Error('disk busy') }
await app.store.getState().confirmAndWrite()
assert.equal(app.store.getState().getActiveProject().status, 'done')
assert.equal(app.store.getState().getActiveProject().generatedStory, text(100))
assert.equal(app.calls.length, 1)
assert.equal(app.chatCalls.length, 1)
const { recoverChapter } = app.load(path.resolve('src/renderer/src/services/chapterRecovery.ts'))
let runs = 0
await assert.rejects(recoverChapter(async () => { runs++; throw Error('other failure') }, () => false, () => {}), /3 lần xử lý/)
assert.equal(runs, 3)
console.log('PASS: 3 recovery rounds, length/API recovery, manual exhaustion, cancel and save-only recovery without duplicate prose')
