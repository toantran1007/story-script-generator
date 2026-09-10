import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

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
const formatter = { exports: {} }
const formatterOutput = ts.transpileModule(fs.readFileSync('src/shared/storyFormatting.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText
new Function('module', 'exports', formatterOutput)(formatter, formatter.exports)
const { formatStoryWithHook } = formatter.exports
const exportSource = main.slice(main.indexOf("ipcMain.handle('store:export-story'"), main.indexOf('// Test API connection'))
let handler
let written
new Function('ipcMain', 'dialog', 'writeFileSync', 'formatStoryWithHook', transpile(exportSource))(
  { handle: (_channel, fn) => { handler = fn } },
  { showSaveDialog: async () => ({ filePath: 'test-only.txt', canceled: false }) },
  (_file, text) => { written = text }, formatStoryWithHook
)
const copySource = output.slice(output.indexOf('  const handleCopy ='), output.indexOf('  const hasFailed ='))
for (const [hookText, generatedStory, expected] of [
  ['HOOK', 'STORY', 'HOOK\n\n---\n\nSTORY'],
  ['HOOK.', 'HOOK.\n\nSTORY', 'HOOK.\nSTORY'],
  ['Câu đầu. Câu sau.', 'Câu đầu.\n\nCâu sau. Kết thúc.', 'Câu đầu.\nCâu sau.\nKết thúc.'],
  ['', 'Câu một. Câu hai.\n\nCâu ba.', 'Câu một.\nCâu hai.\nCâu ba.'],
  ['', 'Cậu đáp.\n“Ta sắp không trụ nổi!”', 'Cậu đáp.\n“Ta sắp không trụ nổi!”'],
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
