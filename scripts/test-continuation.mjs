import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { mergeContinuation } = load('src/renderer/src/services/longStory/continuation.ts')
const anchor = 'Lan placed the only brass key inside the small wooden box.'
const base = 'The rain finally stopped.\n\n' + anchor
const tail = '\nShe closed the lid and walked home.'
assert.equal(mergeContinuation(base, base + tail).text, base + tail)
assert.equal(mergeContinuation(base, anchor + tail).text, base + tail)
assert.equal(mergeContinuation(base, base.replace(/\n+/g, ' ') + tail).text, base + tail)
assert.throws(() => mergeContinuation(base, base), /chỉ lặp/)
assert.equal(mergeContinuation(base, base.slice(0, 25), false), null)
assert.throws(() => mergeContinuation(base, anchor), /chỉ lặp/)
assert.throws(() => mergeContinuation(base + '\n' + anchor, anchor + tail), /nhiều lần/)
assert.throws(() => mergeContinuation(base, base.slice(0, 40) + 'CHANGED STORY'), /thay đổi/)
assert.equal(mergeContinuation('She was wait', 'ing by the door.').text, 'She was waiting by the door.')
assert.equal(mergeContinuation('She was waiting', ' by the door.').text, 'She was waiting by the door.')
for (const text of ['猫は箱の前で静かに待っていた。'.repeat(3), 'เขาวางกุญแจลงในกล่องไม้อย่างระมัดระวัง']) {
  assert.equal(mergeContinuation(text, text + '\nそして朝になった。').text, text + '\nそして朝になった。')
}
for (let i = 1; i < base.length; i++) assert.equal(mergeContinuation(base, base.slice(0, i), false), null)
console.log('PASS: full echo, unique tail overlap, whitespace mapping, ambiguous/changed echo, Unicode and interrupted words')
