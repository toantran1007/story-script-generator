import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { formatSentenceLines, formatStoryWithHook } = load('src/shared/storyFormatting.ts')
const { plainNarration } = load('src/shared/plainNarration.ts')
for (const [source, expected, language] of [
  ['Khải nheo mắt. Cậu chạm bánh răng.\n\nÁnh sáng bùng lên.', 'Khải nheo mắt.\nCậu chạm bánh răng.\nÁnh sáng bùng lên.', 'vi'],
  ['Cậu nhìn lên… Tuyết đang rơi. Cậu bước đi.', 'Cậu nhìn lên.\nTuyết đang rơi.\nCậu bước đi.', 'vi'],
  ['Giá là 3.5 đồng. Anh trả tiền.', 'Giá là 3.5 đồng.\nAnh trả tiền.', 'vi'],
  ['時計が止まった。光が現れた！彼は消えた。', '時計が止まった。\n光が現れた。\n彼は消えた。', 'ja'],
  ['One sentence.\r\n\r\nAnother sentence.', 'One sentence.\nAnother sentence.', 'en'],
  ['', '', 'vi']
]) {
  const result = formatSentenceLines(source, language)
  assert.equal(result, expected)
  assert.equal(result.replace(/\s/g, ''), plainNarration(source).replace(/\s/g, ''), 'only whitespace may change')
  assert.equal(formatSentenceLines(result, language), result, 'formatting is idempotent')
}
assert.equal(formatStoryWithHook('Câu một. Câu hai.', 'Câu một.', 'vi'), 'Câu một.\nCâu hai.')
assert.equal(formatStoryWithHook('Câu một. Câu hai.', 'Câu hai.', 'vi'), 'Câu hai.\n\nCâu một.\nCâu hai.')
for (const file of [
  'live-isekai-results-20260909-v3/isekai-nguoi-sua-dong-ho.json',
  'live-opening-results-20260909-v2/hoc-vien-bong.json'
]) {
  if (!fs.existsSync(file)) continue
  const project = JSON.parse(fs.readFileSync(file, 'utf8'))
  const result = formatSentenceLines(project.generatedStory, project.language)
  assert(!result.includes('\n\n'))
  assert.equal(result.replace(/\s/g, ''), plainNarration(project.generatedStory).replace(/\s/g, ''))
}
console.log('PASS: one sentence per line, no paragraph gaps, plain punctuation, preserved letters, decimals, ellipsis, Japanese, CRLF, idempotence and hook deduplication')
