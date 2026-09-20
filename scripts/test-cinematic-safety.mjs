import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const safety = load('src/renderer/src/services/cinematicSafety.ts')
const prompts = load('src/renderer/src/services/promptEngine.ts')

assert.equal(safety.scanCinematicSafety('Hai người yêu nhau và nắm tay dưới mưa.').length, 0)
assert.equal(safety.scanCinematicSafety('Một người bị thương, camera chuyển sang bàn tay run và tiếng còi cứu thương.').length, 0)
assert(safety.scanCinematicSafety('The scene describes explicit sexual intercourse.').some((f) => f.category === 'sexual_explicit'))
assert(safety.scanCinematicSafety('A teenage girl is placed in an erotic scene.').some((f) => f.category === 'minor_sexualization'))
assert(safety.scanCinematicSafety('Máu văng tung tóe, nội tạng lộ ra.').some((f) => f.category === 'graphic_gore'))
assert(safety.scanCinematicSafety('The story calls for rape and sexual exploitation.').some((f) => f.category === 'sexual_violence'))
assert.throws(() => safety.assertCinematicSafety('A gory dismemberment is shown.'), /nhạy cảm/)
assert.doesNotThrow(() => safety.assertCinematicSafety('The door closes. The next shot shows the shaken witness and arriving medics.'))
const fallback = safety.rewriteCinematicFallback('官能的な接触と嬌声。少女の意識が揺れる。')
assert(fallback.replacements > 0 && !safety.scanCinematicSafety(fallback.text).length, 'Japanese last-mile fallback removes only exact high-confidence phrases')
assert(safety.rewriteCinematicFallback('少女の意識が揺れる。').text === '少女の意識が揺れる。', 'safety fallback must never invent adulthood or change character age')

for (const prompt of [
  prompts.buildOutlinePrompt('A tense rescue.', 'dramatic', 'vi', 3, [], []),
  prompts.buildChapterChunkPrompt({ title: 'T', outlineSummary: '', chapters: [{ chapter: 1, title: 'T', summary: 'A tense rescue.', estimatedWords: 100 }] }, 0, 'dramatic', 'vi', { chunkIndex: 0, totalChunks: 1, targetChars: 100, isLastChunk: true, hookWindowChars: 0, previousContext: null }),
  prompts.buildPostStoryHookPrompt('A tense rescue.', 'dramatic', 'vi', 500),
  prompts.buildScriptAnalysisPrompt('A tense rescue.', 'dramatic', 'vi')
]) assert(prompt.system.includes('CINEMATIC SAFETY FOR IMAGE/VIDEO'))

console.log('PASS: cinematic safety scanner, rewrite contract and visual prompt coverage')
