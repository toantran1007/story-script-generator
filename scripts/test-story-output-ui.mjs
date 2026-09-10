import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const root = path.resolve('src/renderer/src')
let state
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => {
    if (id.startsWith('@shared/')) return load(path.resolve('src/shared', `${id.slice(8)}.ts`))
    if (id === '@/stores/storyStore') return { useAppStore: (selector) => selector ? selector(state) : state }
    if (id === '@/components/StopButton') return { StopButton: () => null }
    if (id === '@/components/LogPanel') return { LogPanel: () => null }
    if (!id.startsWith('@/')) return require(id)
    const target = path.join(root, id.slice(2))
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
  })
  return module.exports
}
const { createEmptyProject } = load(path.join(root, 'types/index.ts'))
const { WizardStep3 } = load(path.join(root, 'components/WizardStep3.tsx'))
for (const qualityReviewState of ['pending', 'failed', 'passed']) {
  const project = { ...createEmptyProject('sample', 'Sample'), outlinePhase: 'done', status: qualityReviewState === 'passed' ? 'done' : 'writing',
    generatedStory: 'A story.', hookText: qualityReviewState === 'passed' ? 'A story.' : '', qualityReviewState }
  state = { getActiveProject: () => project, getActiveRuntime: () => ({ isGenerating: false, error: null, logs: [] }) }
  const html = renderToStaticMarkup(React.createElement(WizardStep3))
  if (qualityReviewState === 'passed') {
    assert(html.includes('Xuất .txt'))
    assert(!html.includes('Rà soát logic truyện'))
    assert.equal(html.split('A story.').length - 1, 1, 'opening hook is not displayed twice')
  } else assert(html.includes('Xuất .txt'), 'completed writing no longer blocks export on review state')
}
console.log('PASS: legacy review flags do not block export and no review action remains in the rendered UI')
const dialogueProject = { ...createEmptyProject('voice', 'Voice'), outlinePhase: 'done', status: 'done',
  qualityReviewState: 'passed', generatedStory: 'Cậu đáp.\n“Ta sắp không trụ nổi!”', hookText: '' }
state = { getActiveProject: () => dialogueProject, getActiveRuntime: () => ({ isGenerating: false, error: null, logs: [] }) }
assert(renderToStaticMarkup(React.createElement(WizardStep3)).includes('Cậu đáp.\n“Ta sắp không trụ nổi!”'))
console.log('PASS: rendered story retains direct dialogue on its own line')
dialogueProject.chapterMemories = [{ chapter: 1, complete: true, summary: 'INTERNAL_MEMORY_ONLY', events: [], state: [], openThreads: [] }]
const memoryHtml = renderToStaticMarkup(React.createElement(WizardStep3))
assert(memoryHtml.includes('Đã lưu memory 1 chương'))
assert(!memoryHtml.includes('INTERNAL_MEMORY_ONLY'))
console.log('PASS: UI shows saved chapter count without leaking memory into story content')
dialogueProject.memoryRecords = [{ id: 'uncertain', status: 'unknown', source: { verified: false }, verificationIssue: { code: 'not_found' } }]
const warningHtml = renderToStaticMarkup(React.createElement(WizardStep3))
assert(warningHtml.includes('Có 1 dữ kiện memory chưa xác thực'))
assert(warningHtml.includes('Xuất .txt'), 'evidence warning does not block export')
assert(warningHtml.includes('Cậu đáp.\n“Ta sắp không trụ nổi!”'))
console.log('PASS: evidence warning is visible without blocking story display or export')

for (const busy of [true, false]) {
  state = { getActiveProject: () => dialogueProject, getActiveRuntime: () => ({ isGenerating: busy,
    lastAction: 'generateHook', streamingText: 'HOOK PROCESSING', error: busy ? null : 'Hook failed', logs: [] }) }
  const html = renderToStaticMarkup(React.createElement(WizardStep3))
  assert(html.includes('Tải truyện .txt (không hook)'))
  assert(html.includes('Cậu đáp.'))
  assert(!html.includes('HOOK PROCESSING'))
  assert(!html.includes('Tải truyện + hook .txt'))
}
console.log('PASS: hook-busy and hook-error UI keep prose visible and downloadable')

for (const enableHook of [false, true]) {
  const project = { ...dialogueProject, enableHook, hookText: '' }
  state = { getActiveProject: () => project, getActiveRuntime: () => ({ isGenerating: false, error: null, logs: [] }) }
  const html = renderToStaticMarkup(React.createElement(WizardStep3))
  assert.equal(html.includes('Tải truyện .txt (không hook)'), enableHook)
  assert(html.includes('Xuất .txt'), 'ordinary TXT export remains available')
  assert(html.includes('Xuất .md'), 'ordinary Markdown export remains available')
  assert(!html.includes('Tải truyện + hook .txt'), 'hook-inclusive download requires a generated hook')
}
console.log('PASS: prose-only hook download follows setup choice; ordinary exports remain available with hook disabled')
