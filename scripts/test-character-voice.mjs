import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { plainNarration } = load('src/shared/plainNarration.ts')
const prompts = load('src/renderer/src/services/promptEngine.ts')
const { stripNarrationMarkup } = load('src/renderer/src/services/textCleanup.ts')
const { formatSentenceLines, formatStoryWithHook } = load('src/shared/storyFormatting.ts')
const { verifiedHookExcerpt } = load('src/renderer/src/services/hookExcerpt.ts')
const outline = { title: 'The task', outlineSummary: 'A traveller survives a task.', chapters: [{ chapter: 1, title: 'A task', summary: 'A system requires a task before rewarding a traveller.', estimatedWords: 500 }] }
for (const language of ['vi', 'ja', 'en']) {
  for (const chunkIndex of [0, 1]) {
    const chunk = prompts.buildChapterChunkPrompt(outline, 0, 'custom', language, {
      chunkIndex, totalChunks: 2, targetChars: 1000, previousContext: null, enableHook: false, customStyle: 'Isekai game fantasy'
    })
    assert(chunk.system.includes('CHARACTER VOICE — NARRATION WITH DIRECT SPEECH'))
    assert(chunk.system.includes('Only include system notices if the premise actually has a system'))
    assert(chunk.system.includes('other characters must not react to unspoken thoughts'))
    assert(chunk.system.includes('Do not insert a dialogue quota'))
    assert(!chunk.system.includes('Write dialogue WITHOUT quotation marks'))
  }
}
assert(prompts.buildOutlinePrompt('A person finds a system.', 'dramatic', 'vi', 3, [], []).system.includes('CHARACTER VOICE'))
const repair = prompts.buildLanguageRepairPrompt('“Wait!”', 'vi').system
assert(repair.includes('without quotation marks'))
assert(!repair.includes('explanations, quotation marks, lists'))
console.log('PASS: planning, writing and language repair agree on direct speech and speaker/source identity')

const samples = [
  ['vi', 'Giọng hệ thống vang lên.\n“Ký chủ phải hoàn thành nhiệm vụ mới nhận được phần thưởng.”\nCậu nghiến răng.\n“Còn phải chờ ngươi nhắc sao?”\n“Ta sắp không trụ nổi nữa rồi!”'],
  ['ja', '通知音が響いた。\n「任務を完了すると報酬を受け取れます。」\n透は歯を食いしばった。\n「言われなくてもわかってる！」'],
  ['en', 'The system chimed.\n"Complete the task to receive your reward."\nO\'Brien gritted his teeth.\n"I\'m trying!"'],
  ['vi', 'Cậu nghĩ thầm.\n“Mình phải giấu điều này.”\nNgười lính vẫn nhìn về phía cửa.']
]
for (const [language, source] of samples) {
  const clean = stripNarrationMarkup(`# Title\n${source}`)
  assert.equal(clean, plainNarration(source), 'cleanup preserves words and attribution with plain punctuation')
  const formatted = formatSentenceLines(clean, language)
  assert.equal(formatted, plainNarration(source), 'sentence-per-line formatting preserves spoken words')
  const spoken = source.split('\n')[1]
  assert.equal(verifiedHookExcerpt(source, JSON.stringify({ excerpt: spoken }), 1800), spoken)
  assert(formatStoryWithHook(source, spoken, language).startsWith(plainNarration(spoken)))
}
assert.equal(stripNarrationMarkup('“ĐỪNG LẠI GẦN!”'), 'ĐỪNG LẠI GẦN.', 'shouted dialogue is not mistaken for a title')
assert.equal(stripNarrationMarkup('(cười)\n“Đi thôi!”'), ' cười\nĐi thôi.', 'bracketed words preserved; only punctuation removed')
console.log('PASS: Vietnamese/Japanese/English speech, thoughts and notices survive cleanup, line formatting and verbatim hook selection')
