import { nativeGateResponse } from './lib/native-gate-fixture.mjs'
import assert from 'node:assert/strict'
import { harness } from './test-chapter-memory.mjs'
import { createLoader } from './lib/load-local-ts.mjs'
import { proofreadingCases, otherLanguageCases, correctionPacket } from './lib/proofreading-cases.mjs'
const load = createLoader()
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { languageIntegrityRules } = load('src/renderer/src/services/languageIntegrity.ts')
const { plainNarration } = load('src/shared/plainNarration.ts')
for (const source of [...proofreadingCases, ...otherLanguageCases]) {
  const test = { ...source, draft: plainNarration(source.draft), edits: source.edits.map(e => ({ before: plainNarration(e.before), after: plainNarration(e.after) })) }
  const corrected = test.edits.reduce((text, edit) => text.replace(edit.before, edit.after), test.draft)
  assert(!languageIntegrityRules(test.language, test.customLanguage).includes(test.edits[0].before), 'unseen errors are not embedded in production rules')
  const respond = messages => {
    assert(messages[0].content.includes('CONTEXTUAL NATIVE PROOFREADING'))
    assert(messages[1].content.includes(test.premise))
    assert(messages[1].content.includes(test.draft))
    return JSON.stringify(correctionPacket(test))
  }
  const app = harness([test.draft], [respond], 'new')
  app.store.setState({ projects: [{ ...app.project, language: test.language, customLanguage: test.customLanguage, idea: test.premise,
    outline: { ...app.project.outline, chapters: app.project.outline.chapters.slice(0, 1) } }] })
  await app.store.getState().confirmAndWrite()
  const p = app.store.getState().getActiveProject()
  assert.equal(p.generatedStory, corrected, app.store.getState().getActiveRuntime().error)
  assert.equal(app.calls.length, 1); assert.equal(app.chatCalls.length, 1)
  assert(p.memoryRecords[0].source.verified)
  assert(app.calls[0][0].content.includes('NATIVE WRITING ANCHOR'))

  const invalid = JSON.stringify(correctionPacket(test, { languageReview: undefined }))
  const stopped = harness([test.draft], Array(3).fill(invalid), 'new')
  stopped.store.setState({ projects: [{ ...stopped.project, language: test.language, customLanguage: test.customLanguage, idea: test.premise,
    outline: { ...stopped.project.outline, chapters: stopped.project.outline.chapters.slice(0, 1) } }] })
  await stopped.store.getState().confirmAndWrite()
  const pending = structuredClone(stopped.store.getState().getActiveProject())
  assert.equal(pending.generatedStory, ''); assert.equal(pending.pendingChapter.text, test.draft)
  assert.equal(stopped.chatCalls.length, 3)
  assert(stopped.chatCalls[1][1].content.includes('languageReview'))
  const resumed = harness([], [respond], 'new')
  resumed.store.setState({ projects: [pending], activeProjectId: pending.id })
  await resumed.store.getState().continueWriting()
  assert.equal(resumed.calls.length, 0); assert.equal(resumed.store.getState().getActiveProject().generatedStory, corrected)

  let project = { ...createEmptyProject('context-' + test.language, 'Synthetic'), language: test.language, customLanguage: test.customLanguage, idea: test.premise, duration: .05, enableHook: false }
  const ch = { chapter: 1, targetCharacters: 100, estimatedMinutes: .05, beats: ['Scene begins', 'Scene ends'], ending: 'Scene ends' }
  project.longStory = { version: 1, plan: { version: 1, inputKey: planInputKey(project), canon: [test.premise],
    duration: { requestedMinutes: .05, estimatedMinutes: .05, targetCharacters: 100 }, chapters: [ch], outline: { title: 'T', outlineSummary: test.premise, chapters: [{ chapter: 1, title: 'T', summary: test.premise }] } },
    cursor: 0, stage: 'review', draft: test.draft + '\n', attempt: 0, accepted: [], checkpoints: [] }
  // Tiny synthetic chapters use a small plan budget; this suite tests review, not length.
  project.longStory.plan.duration.targetCharacters = 25
  project.longStory.plan.chapters[0].targetCharacters = 25
  let calls = 0
  await runLongStory({ read: () => project, stopped: () => false, progress: () => {}, chat: async () => { throw Error('unexpected') },
    save: async patch => { project = structuredClone({ ...project, ...patch }) }, stream: async messages => { const gate = nativeGateResponse(messages); if (gate) return gate;
      calls++
      assert(calls <= 2); assert(messages[0].content.includes('Check the supplied chapter'))
      const body = JSON.parse(messages[1].content)
      assert.equal(body.premise, test.premise); assert(body.canon.includes(test.premise))
      assert.equal(body.draft, test.draft + '\n')
      return { text: calls === 1 ? invalid : JSON.stringify(correctionPacket(test)), finishReason: 'stop' }
    } })
  assert.equal(project.generatedStory, corrected); assert.equal(calls, 2)
  assert.equal(project.longStory.stage, 'done')
  console.log(`PASS ${test.language}: context sent, unseen-term patch applied, valid occurrence preserved, memory updated, missing review retries and restart retains original draft (mock LLM)`)
}
