import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const { AUTHOR_TTS_REFERENCE, authorCharacterTarget, authorEstimatedMinutes, authorCharacterRange, DURATION_ANCHORS } = load('src/renderer/src/services/longStory/planner.ts')
const { parsePlan } = load('src/renderer/src/services/longStory/planner.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const japanese = 62500 / 170
assert(Math.abs(AUTHOR_TTS_REFERENCE.ja.charsPerMinute - japanese) < 0.001)
assert.equal(authorCharacterTarget(90, 'ja'), 33088)
assert.equal(authorCharacterTarget(90, 'en'), 29426)
assert.equal(authorCharacterTarget(90, 'th'), 33915)
assert.equal(Math.round(authorEstimatedMinutes(62500, 'ja')), 170)
assert.equal(Math.round(authorEstimatedMinutes(29426, 'en')), 90)
assert.equal(Math.round(authorEstimatedMinutes(33915, 'th')), 90)
assert.equal(Math.round(authorEstimatedMinutes(62500, 'ja')), 170)
assert.deepEqual(authorCharacterRange(90, 'ja'), { min: 33088, max: 33088, nominal: 33088 })
assert.deepEqual(authorCharacterRange(90, 'en'), { min: 28772, max: 30080, nominal: 29426 })
assert.deepEqual(authorCharacterRange(90, 'th'), { min: 33088, max: 34743, nominal: 33915 })
assert(AUTHOR_TTS_REFERENCE.en.charsPerMinute < AUTHOR_TTS_REFERENCE.ja.charsPerMinute)
assert(AUTHOR_TTS_REFERENCE.th.charsPerMinute > AUTHOR_TTS_REFERENCE.ja.charsPerMinute)
assert(DURATION_ANCHORS.includes('62,500'))
assert(DURATION_ANCHORS.includes('10–15% FEWER'))
assert(DURATION_ANCHORS.includes('100–105%'))
const project = { ...createEmptyProject('calibration', 'Calibration'), language: 'ja', duration: 90 }
const outlineChapters = Array.from({ length: 6 }, (_, i) => ({ chapter: i + 1, title: `C${i + 1}`, summary: 'S', estimatedWords: 100 }))
const planChapters = outlineChapters.map((chapter, i) => ({ chapter: i + 1, targetCharacters: i < 4 ? 5515 : 5514, estimatedMinutes: 15, beats: ['A', 'B'], ending: 'E' }))
const validPlan = { outline: { title: 'T', outlineSummary: 'S', chapters: outlineChapters }, duration: { requestedMinutes: 90, estimatedMinutes: 90, targetCharacters: 33088, rationale: 'anchor' }, chapters: planChapters, canon: ['Rule'] }
assert.doesNotThrow(() => parsePlan(JSON.stringify(validPlan), project))
assert.throws(() => parsePlan(JSON.stringify({ ...validPlan, duration: { ...validPlan.duration, targetCharacters: 45000 } , chapters: validPlan.chapters.map(chapter => ({ ...chapter, targetCharacters: 7500 })) }), project), /không khớp neo TTS/)
console.log('PASS: author TTS calibration derives Japanese, English and Thai targets from 62,500 chars / 170 min')
