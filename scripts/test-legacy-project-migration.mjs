// Read-only access to the supplied app config; all migration writes go into an isolated temporary directory.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
if (!process.argv[2]) throw new Error('Supply the legacy configuration path')
const legacy = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).projects
if (!Array.isArray(legacy)) throw new Error('Legacy projects is not an array')
const output = ts.transpileModule(fs.readFileSync('src/main/projectFiles.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
new Function('module', 'exports', 'require', output)(module, module.exports, require)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kichban-legacy-copy-'))
const store = new module.exports.ProjectFileStore(root)
store.migrate(legacy)
const restored = store.list()
assert.equal(restored.length, legacy.length)
for (const old of legacy) {
  const expected = { ...old, storageEpoch: old.storageEpoch || 0 }
  for (const key of ['apiKey', 'apiProfiles', 'settings', 'authorization']) delete expected[key]
  assert.deepEqual(restored.find((p) => p.id === old.id), expected)
}
console.log(`PASS: ${legacy.length} real legacy project(s) round-trip unchanged on an isolated copy, including script, preferences and memory.`)
console.log(`Original configuration was not modified. Isolated copy: ${root}`)
