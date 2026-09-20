import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { projectActivity } = load('src/renderer/src/services/projectActivity.ts')
const p = createEmptyProject('new-engine', 'New engine')
assert.equal(p.writingEngine, 'long-v3')
const input = fs.readFileSync('src/renderer/src/components/WizardStep1.tsx', 'utf8')
assert(!input.includes('setReadingSpeed'))
assert(!input.includes('targetCharsFor'))
assert(input.includes('AI sẽ lập kế hoạch'))
const output = fs.readFileSync('src/renderer/src/components/WizardStep3.tsx', 'utf8')
assert(output.includes("handleExport('json')"))
assert(output.includes('ước tính bởi AI'))
assert.equal(projectActivity({ ...p, longStory: { error: 'manual failure' } }).color, 'var(--error)')
console.log('PASS: new-project routing, removed fixed speed UI, AI estimate label and JSON export control')
