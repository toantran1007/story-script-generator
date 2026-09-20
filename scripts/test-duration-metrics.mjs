import { proseFixture } from './lib/prose-fixture.mjs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const { narrationChars, readingMinutes, durationAssessment, countText } = createLoader()('src/renderer/src/services/textMetrics.ts')
for (const lang of ['ja', 'zh', 'th']) {
  assert.equal(narrationChars('猫。\n\n 犬。\r\n', lang), narrationChars('猫。犬。', lang))
  assert.equal(countText('猫。\n 犬。', lang).value, 4)
}
assert.equal(narrationChars('Hello.\r\n\r\n   World.', 'en'), narrationChars('Hello. World.', 'en'))
assert.equal(readingMinutes('Xin chào.\n\n   Tạm biệt.', 'vi'), readingMinutes('Xin chào. Tạm biệt.', 'vi'))
assert.equal(narrationChars('😀', 'ja'), 1)
assert.equal(readingMinutes(' \r\n\t ', 'vi'), 0)
for (const count of [850, 1000, 1150, 5000]) assert.equal(durationAssessment(proseFixture(count), 1, 'en').outsideTolerance, false)
assert.equal(durationAssessment(proseFixture(849), 1, 'en').outsideTolerance, true)
assert.equal(durationAssessment(proseFixture(20000), 110, 'ja', 700).outsideTolerance, true)
assert.equal(readingMinutes(proseFixture(20000), 'ja', 700), 29)
assert.equal(readingMinutes(proseFixture(20000), 'ja'), 58)
console.log('PASS: normalized narration metrics, Unicode, whitespace, custom speed and lower-only 15% boundary')
