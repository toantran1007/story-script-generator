import { proseFixture } from './lib/prose-fixture.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { createLoader } from './lib/load-local-ts.mjs'
const { exportStoryJSON } = createLoader()('src/shared/storyExport.ts')

const main = fs.readFileSync('src/main/index.ts', 'utf8')
const store = fs.readFileSync('src/renderer/src/stores/storyStore.ts', 'utf8')
const output = fs.readFileSync('src/renderer/src/components/WizardStep3.tsx', 'utf8')

assert.match(store, /await generateHookForProject\(pid\)/, 'completed writing invokes post-production hook generation')
assert.match(store, /updateProjectById\(pid, \{ hookText: hook \}\)/, 'generated hook is persisted on the project')
assert.match(store, /if \(saved\) await window\.api\.saveProject/, 'hook is saved before completion returns')
assert.match(output, /story-output__hook/, 'hook is rendered in the story output')
assert.match(output, /formatStoryWithHook\(p.generatedStory, p.hookText/, 'copy uses the shared formatter')
assert.match(main, /formatStoryWithHook\(project.generatedStory, project.hookText/, 'TXT export uses the shared formatter')
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const { formatStoryWithHook } = createLoader()('src/shared/storyFormatting.ts')
const { assertNoTextRepetition } = createLoader()('src/shared/textRepetition.ts')
const exportSource = main.slice(main.indexOf("ipcMain.handle('store:export-story'"), main.indexOf('// Test API connection'))
let handler
let written
new Function('ipcMain', 'dialog', 'writeFileSync', 'formatStoryWithHook', 'exportStoryJSON', 'assertNoTextRepetition', transpile(exportSource))(
  { handle: (_channel, fn) => { handler = fn } },
  { showSaveDialog: async () => ({ filePath: 'test-only.txt', canceled: false }) },
  (_file, text) => { written = text }, formatStoryWithHook, exportStoryJSON, assertNoTextRepetition
)
const copySource = output.slice(output.indexOf('  const handleCopy ='), output.indexOf('  const hasFailed ='))
for (const [hookText, generatedStory, expected] of [
  ['HOOK', 'STORY', 'HOOK\n\nSTORY'],
  ['HOOK.', 'HOOK.\n\nSTORY', 'HOOK.\nSTORY'],
  ['Câu đầu. Câu sau.', 'Câu đầu.\n\nCâu sau. Kết thúc.', 'Câu đầu.\nCâu sau.\nKết thúc.'],
  ['', 'Câu một. Câu hai.\n\nCâu ba.', 'Câu một.\nCâu hai.\nCâu ba.'],
  ['', 'Cậu đáp.\n“Ta sắp không trụ nổi!”', 'Cậu đáp.\nTa sắp không trụ nổi.'],
  ['', 'STORY', 'STORY']
]) {
  const project = { name: 'Test', style: 'dramatic', language: 'vi', duration: 3, hookText, generatedStory }
  await handler(null, project, 'txt')
  assert.equal(written, expected)
  await handler(null, project, 'md')
  assert(written.endsWith(expected))
  let copied
  new Function('p', 'navigator', 'formatStoryWithHook', transpile(`${copySource}\nhandleCopy()`))(project, { clipboard: { writeText: (text) => { copied = text } } }, formatStoryWithHook)
  assert.equal(copied, expected)
}
console.log('PASS: actual TXT/Markdown export handler and copy action include hook once, including when hook is the existing opening')
await handler(null, { id: 'json-test', name: 'JSON', language: 'ja', style: 'custom', duration: 8, generatedStory: '猫。', hookText: '', apiKey: 'private-key', settings: { apiKey: 'private-key' }, longStory: { plan: { duration: { source: 'ai-estimate' } }, accepted: [{ chapter: 1, estimatedMinutes: 8 }] }, chapterDocuments: [{ chapter: 1, complete: true, text: '猫。' }] }, 'json')
assert.equal(JSON.parse(written).generatedStory, '猫。')
assert.equal(JSON.parse(written).estimatedMinutes, 0, 'two characters cannot be exported as eight minutes from the old AI field')
assert.equal(JSON.parse(written).chapters.length, 1)
assert(!written.includes('private-key'))
await handler(null, { id: 'actual-duration', name: 'Longer than requested', language: 'ja', style: 'custom', duration: 90,
  generatedStory: proseFixture(62500), longStory: { plan: { duration: { estimatedMinutes: 90, actualEstimatedMinutes: 90, actualCharacters: 33088 } }, accepted: [{ chapter: 1, estimatedMinutes: 90 }] } }, 'json')
assert.equal(JSON.parse(written).estimatedMinutes, 170)
assert.equal(JSON.parse(written).requestedMinutes, 90)
assert.equal(JSON.parse(written).actualCharacters, 62500)
assert.equal(JSON.parse(written).durationPlan.actualEstimatedMinutes, 170)
assert.equal(JSON.parse(written).durationSource, 'author-tts-calibration')
assert.equal(JSON.parse(written).actualTtsMeasured, false)
console.log('PASS: actual JSON export handler preserves chapters and AI estimates without secrets')

if (process.argv.includes('--export-samples')) {
  fs.mkdirSync('quality-results-20260909', { recursive: true })
  for (const [directory, id] of [
    ['live-quality-20260909-isekai-v2', 'isekai-nguoi-sua-dong-ho'],
    ['live-quality-20260909-dragon', 'nguoi-sua-den'],
    ['live-quality-20260909-academy', 'hoc-vien-bong']
  ]) {
    const project = JSON.parse(fs.readFileSync(`${directory}/${id}.json`, 'utf8'))
    assert.equal(project.qualityReviewState, 'passed')
    assert(project.generatedStory.includes(project.hookText), 'live hook is a verbatim excerpt')
    assert(project.preReviewStory, 'live correction keeps its pre-review draft')
    await handler(null, project, 'txt')
    fs.writeFileSync(`quality-results-20260909/${id}.txt`, written, 'utf8')
    console.log(`EXPORTED ${id}: story ${project.generatedStory.length}, hook ${project.hookText.length}, TXT ${written.length} chars`)
  }
}
