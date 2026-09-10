import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const code = ts.transpileModule(fs.readFileSync('src/main/projectFiles.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
let failCommit = false, failDelete = false
const module = { exports: {} }
new Function('module', 'exports', 'require', code)(module, module.exports, (id) => id === 'fs' ? {
  ...fs, renameSync: (from, to) => {
    if (failCommit && to.endsWith('project.json')) throw Error('simulated crash before commit')
    return fs.renameSync(from, to)
  }, rmSync: (target, options) => { if (failDelete) throw Error('simulated busy directory'); return fs.rmSync(target, options) }
} : require(id))
const { ProjectFileStore } = module.exports
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kichban-project-files-'))
const root = path.join(temp, 'data')
let store = new ProjectFileStore(root)
const original = { id: 'p1', name: '9-1', updatedAt: '2026-09-10T10:00:00Z', generatedStory: 'First chapter. Second chapter.',
  enableHook: false, language: 'ja', duration: 5, autoFlow: true, hookText: '', writingMemory: { currentChunk: 2 },
  chapterDocuments: [{ chapter: 1, text: 'First chapter.', complete: true }],
  chapterMemories: [{ chapter: 1, summary: 'First.' }], memoryRecords: [{ id: 'r1', text: 'Stored fact.' }], memoryHistory: [{ previous: 'old', next: 'new' }],
  memoryIssues: [{ code: 'not_found', recordId: 'r1', suppliedEvidence: 'Exact evidence supplied by the model.' }] }
store.migrate([{ ...original, apiKey: 'FAKE_DO_NOT_COPY', settings: { apiKey: 'FAKE_DO_NOT_COPY' } }])
assert.equal(store.list()[0].generatedStory, original.generatedStory)
assert.equal(store.list()[0].enableHook, false)
assert.equal(store.list()[0].storageEpoch, 0)
assert.equal(fs.readFileSync(path.join(root, 'projects/p1/chapters/1.txt'), 'utf8'), 'First chapter.')
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'projects/p1/memory-issues.json'), 'utf8'))[0].recordId, 'r1')
const migration = fs.readdirSync(path.join(root, 'migrations'))[0]
assert(!fs.readFileSync(path.join(root, 'migrations', migration), 'utf8').includes('FAKE_DO_NOT_COPY'))
const projectBackup = fs.readdirSync(path.join(root, 'projects/p1')).find((name) => name.startsWith('migration-'))
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'projects/p1', projectBackup), 'utf8')).generatedStory, original.generatedStory)
assert(!fs.readFileSync(path.join(root, 'projects/p1/project.json'), 'utf8').includes('FAKE_DO_NOT_COPY'))
console.log('PASS: project-only backup and verified migration preserve story/preferences/memory and exclude connection secrets')

const newer = { ...original, updatedAt: '2026-09-10T11:00:00Z', generatedStory: 'Latest story.' }
store.save(newer)
store.migrate([original])
assert.equal(store.list()[0].generatedStory, 'Latest story.', 'rerunning migration never overwrites the newer local version')
store.save(original)
assert.equal(store.list()[0].generatedStory, 'Latest story.', 'late stale timestamp cannot replace newer state')
failCommit = true
assert.throws(() => store.save({ ...newer, generatedStory: 'Uncommitted new prose.' }), /simulated/)
failCommit = false
store = new ProjectFileStore(root)
assert.equal(store.list()[0].generatedStory, 'Latest story.')
assert.equal(fs.readFileSync(path.join(root, 'projects/p1/story.txt'), 'utf8'), 'Latest story.', 'derived files recover from canonical snapshot')
fs.writeFileSync(path.join(root, 'projects/p1/project.json'), '{broken', 'utf8')
store = new ProjectFileStore(root)
assert.equal(store.list()[0].generatedStory, 'Latest story.', 'last verified backup recovers a corrupt snapshot')
console.log('PASS: migration is idempotent; interrupted writes do not mix prose/memory; corrupt snapshots recover from backup')

const external = path.join(temp, 'my-export.txt')
fs.writeFileSync(external, 'User export.')
store.save({ ...newer, id: 'p2', name: 'Other project' })
failDelete = true
assert.throws(() => store.remove('p1'), /simulated/)
failDelete = false
assert(!store.list().some((p) => p.id === 'p1'), 'committed deletion remains hidden when physical removal needs retry')
assert.throws(() => store.save(newer), /deleted/)
store.remove('p1')
assert(!fs.existsSync(path.join(root, 'projects/p1')))
assert.equal(store.listDeleted().length, 0)
assert.equal(fs.readdirSync(path.join(root, 'trash')).length, 0)
assert.throws(() => store.save(newer), /deleted/)
store = new ProjectFileStore(root)
store.migrate([original])
assert(!store.list().some((p) => p.id === 'p1'), 'old migration cannot resurrect a deleted project')
assert.equal(fs.readFileSync(external, 'utf8'), 'User export.')
assert.equal(store.list()[0].id, 'p2')
assert.throws(() => store.restore('p1'), /vĩnh viễn/)
assert.equal(store.listDeleted().length, 0)
console.log('PASS: permanent deletion removes project and backups, rejects late saves/restoration and preserves external exports')

for (const id of ['../escape', '..', 'C:\\outside', 'a/b', '__proto__']) assert.throws(() => store.save({ ...original, id }), /Invalid project id/)
const partialRoot = path.join(temp, 'partial-import')
const partial = new ProjectFileStore(partialRoot)
failCommit = true
assert.throws(() => partial.migrate([original]))
failCommit = false
assert(fs.readdirSync(path.join(partialRoot, 'migrations')).length > 0)
partial.migrate([original])
assert.equal(partial.list()[0].id, original.id)
console.log('PASS: traversal/reserved ids rejected; failed migration retains backup and can resume')

try {
  const outside = path.join(temp, 'outside'); fs.mkdirSync(outside)
  const linkedRoot = path.join(temp, 'linked')
  fs.symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => new ProjectFileStore(linkedRoot), /symbolic links|junctions/)
  console.log('PASS: linked/junction data roots rejected')
} catch (error) {
  if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error
  console.log('SKIP: system did not allow creating a link fixture')
}
console.log(`Isolated test data: ${temp}`)
