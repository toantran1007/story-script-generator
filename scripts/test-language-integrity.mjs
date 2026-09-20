import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const { nativeProofreadLanguage, languageIntegrityRules, LANGUAGE_PROOFREADING_CONTRACT, assertNativeProofread } = load('src/renderer/src/services/languageIntegrity.ts')
const { targetLanguageRules } = load('src/renderer/src/services/promptEngine.ts')
const { planningMessages } = load('src/renderer/src/services/longStory/planner.ts')
const { LONG_STORY_REVIEW } = load('src/renderer/src/services/longStory/review.ts')
const { CHAPTER_CORRECTION_CONTRACT } = load('src/renderer/src/services/chapterCorrection.ts')
assert.equal(nativeProofreadLanguage('ja'), 'ja')
const japaneseRules = languageIntegrityRules('ja')
assert(japaneseRules.includes('同音異義語') && japaneseRules.includes('meaning'))

assert.equal(nativeProofreadLanguage('th'), 'th')
const thaiRules = languageIntegrityRules('th')
assert(thaiRules.includes('homophones') && thaiRules.includes('STT'))
assert(LANGUAGE_PROOFREADING_CONTRACT.includes('previously unseen terms'))
assert.throws(() => assertNativeProofread({ languageReview: { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: ['ambiguous term'] } }, 'ja'), /chưa đạt/)
assert.doesNotThrow(() => assertNativeProofread({ languageReview: { language: 'ja', complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] } }, 'ja'))

const prompt = targetLanguageRules('ja')
assert(prompt.includes('JAPANESE NATIVE WRITING ANCHOR') && prompt.includes('同音異義語'))
const planPrompt = planningMessages({ duration: 1, language: 'th', customLanguage: '', idea: '', ideaInputType: 'idea', style: 'dramatic', customStyle: '' })[0].content
assert(planPrompt.includes('THAI NATIVE EDITING'))
assert(LONG_STORY_REVIEW.includes('CONTEXTUAL NATIVE PROOFREADING') && LONG_STORY_REVIEW.includes('meaning'))
assert(CHAPTER_CORRECTION_CONTRACT.includes('CONTEXTUAL NATIVE PROOFREADING') && CHAPTER_CORRECTION_CONTRACT.includes('homophone'))
assert(!prompt.includes('languageReview'), 'writing must not be told to print review JSON in narration')
for (const language of ['vi', 'en', 'ko', 'zh', 'ja', 'th']) {
  assert.throws(() => assertNativeProofread({}, language), /languageReview/)
  const report = { language, complete: true, checks: { meaning: true, orthography: true, entities: true, nativeStyle: true }, unresolved: [] }
  for (const invalid of [{ ...report, complete: false }, { ...report, language: 'wrong' }, { ...report, checks: {} }, { ...report, unresolved: ['need context'] }]) {
    assert.throws(() => assertNativeProofread({ languageReview: invalid }, language), /chưa đạt/)
  }
  assert.doesNotThrow(() => assertNativeProofread({ languageReview: report }, language))
  assert(languageIntegrityRules(language).includes('NATIVE WRITING ANCHOR'))
  if (!['ja', 'th'].includes(language)) assert(!languageIntegrityRules(language).includes('JAPANESE NATIVE'))
}
assert.equal(nativeProofreadLanguage('custom', '日本語'), 'ja')
assert.equal(nativeProofreadLanguage('custom', 'ภาษาไทย'), 'th')
assert.equal(nativeProofreadLanguage('en', 'Thai'), 'en')
assert.equal(nativeProofreadLanguage('custom', 'Deutsch'), 'Deutsch')
assert.throws(() => nativeProofreadLanguage('custom', '  '), /tùy chỉnh/)
assert.throws(() => assertNativeProofread({}, 'custom', 'Deutsch'), /languageReview/)
assert(!languageIntegrityRules('ja').includes('剣聖'), 'example terms belong only in test fixtures')
assert(!languageIntegrityRules('th').includes('เสี่ยวเสี่ยว'), 'example names must not become global canon')
console.log('PASS: native writing anchors and review-report validation (not proof of LLM linguistic accuracy)')

const { nativeSpellingContext } = load('src/renderer/src/services/languageIntegrity.ts')
const { chapterReferenceContext } = load('src/renderer/src/services/chapterCorrection.ts')
const { longStoryContext } = load('src/renderer/src/services/longStory/memory.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const prior = { ...createEmptyProject('spelling', 'Test'), chapterDocuments: [
  { chapter: 2, complete: true, text: 'Established domain spelling: อัลตราซาวนด์' },
  { chapter: 1, complete: true, text: 'Earlier canon' },
  { chapter: 3, complete: true, text: 'Current chapter excluded' },
  { chapter: 0, complete: false, text: 'Unaccepted draft excluded' }
] }
const context = nativeSpellingContext(prior, 3)
assert(context.includes('อัลตราซาวนด์'))
assert(context.indexOf('Earlier canon') < context.indexOf('Established domain'))
assert(!context.includes('excluded'))
assert.equal(JSON.parse(chapterReferenceContext(prior, 3)).spellingContext, context)
assert.equal(JSON.parse(longStoryContext(prior, 3, '')).spellingContext, context)
const huge = nativeSpellingContext({ chapterDocuments: [{ chapter: 1, complete: true, text: 'A'.repeat(40000) + 'tail spelling' }] }, 2)
assert(huge.includes('Middle omitted') && huge.endsWith('tail spelling') && huge.length < 24200)
assert(LANGUAGE_PROOFREADING_CONTRACT.includes('MEANING IN SCENE'))
assert(LANGUAGE_PROOFREADING_CONTRACT.includes('CROSS-CHAPTER SPELLING'))
console.log('PASS: bounded verbatim spelling context reaches both engines, excludes current/unaccepted drafts and preserves early/latest spellings')
