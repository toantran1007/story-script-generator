import assert from 'node:assert/strict'
import { harness } from './test-chapter-memory.mjs'

const prose = n => Array.from({ length: Math.ceil(n / 12) }, (_, i) => `猫${i}は静かな部屋にいた。`).join('').slice(0, n)
const correction = text => JSON.stringify({ edits: [], languageReview: { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }, memory: {
  chapter: { summary: 'Cat.', events: ['Cat rests.'], state: [], openThreads: [] },
  updates: [{ id: 'cat', kind: 'character', subject: 'cat', text: 'Cat rests.', status: 'current', importance: 'normal', related: [], evidence: text }]
} })
function setup(responses, chats) {
  const app = harness(responses, chats, 'new', true)
  app.store.setState({ projects: [{ ...app.project, language: 'ja', duration: 1, readingSpeed: 100,
    outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
  return app
}
for (const initial of [prose(30)]) {
  const app = setup([initial, prose(100)], [correction(prose(100))])
  await app.store.getState().confirmAndWrite()
  assert.equal(app.store.getState().getActiveProject().status, 'done')
  assert.equal(app.store.getState().getActiveProject().generatedStory, prose(100))
  assert.equal(app.calls.length, 2)
  assert.equal(app.chatCalls.length, 1, 'memory only after length acceptance')
  assert(app.calls[1][1].content.includes('NOT a continuation'))
  assert(app.calls[1][1].content.includes('Never invent a new event'))
  assert(app.saved.some(p => p.pendingChapter?.originalText === initial))
}
let app = setup([prose(30), prose(40), prose(50)], [])
await app.store.getState().confirmAndWrite()
let failed = structuredClone(app.store.getState().getActiveProject())
assert.equal(app.calls.length, 3)
assert.equal(app.chatCalls.length, 0)
assert.equal(failed.generatedStory, '')
assert.equal(failed.pendingChapter.originalText, prose(30))
assert.equal(failed.pendingChapter.text, prose(50))
assert.match(failed.pendingChapter.lastError, /thủ công/)
app = setup([prose(100)], [correction(prose(100))])
app.store.setState({ projects: [failed], activeProjectId: failed.id })
await app.store.getState().continueWriting()
assert.equal(app.calls.length, 1)
assert(app.calls[0][1].content.includes('LENGTH REVISION'))
assert.equal(app.store.getState().getActiveProject().status, 'done')

for (const n of [85, 115, 200]) {
  app = setup([prose(n).split('').join('\n\n')], [correction(prose(n))])
  await app.store.getState().confirmAndWrite()
  assert.equal(app.store.getState().getActiveProject().status, 'done')
  assert.equal(app.calls.length, 1, 'formatting does not trigger length revision')
}
const shrink = JSON.stringify({ ...JSON.parse(correction(prose(30))), edits: [{ before: prose(100), after: prose(30) }] })
app = setup([prose(100)], [shrink, shrink, shrink])
await app.store.getState().confirmAndWrite()
assert.equal(app.chatCalls.length, 3)
assert.equal(app.store.getState().getActiveProject().generatedStory, '')
assert.equal(app.store.getState().getActiveProject().pendingChapter.text, prose(100))

app = setup([], [])
app.store.setState({ projects: [{ ...app.project, ...failed, generatedStory: prose(30), pendingChapter: null,
  writingMemory: { ...failed.writingMemory, completedChapters: 1, currentChapter: 1 } }] })
await app.store.getState().continueWriting()
assert.notEqual(app.store.getState().getActiveProject().status, 'done')
assert.match(app.store.getState().getActiveRuntime().error, /Chưa đạt thời lượng/)
assert.equal(app.calls.length, 0, 'never append new plot after all chapters are complete')
console.log('PASS: length recovery, original draft, 3-call limit, resume, whitespace, correction shrink and final completion gate')
