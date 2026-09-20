import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const root = path.resolve('src/renderer/src')

async function scenario(ignoreAbort) {
  const cache = new Map(), listeners = new Map(), disk = new Map(), trash = new Map()
  let resolveRequest, rejectRequest, aborts = 0, deleteCalls = 0
  globalThis.window = { api: {
    chatStream: () => new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject }),
    chatStreamDetailed: () => new Promise((resolve, reject) => { resolveRequest = (text) => resolve({ text, finishReason: 'stop' }); rejectRequest = reject }),
    onStreamChunk: (id, listener) => { listeners.set(id, listener); return () => listeners.delete(id) },
    abortRequest: async () => { aborts++; if (!ignoreAbort) rejectRequest(new Error('aborted')); return true },
    confirmDeleteProject: async () => { throw Error('Delete must not show a confirmation dialog') },
    saveProject: async (project) => { if (trash.has(project.id)) throw Error('tombstoned'); disk.set(project.id, structuredClone(project)); return [] },
    deleteProject: async (id) => { deleteCalls++; trash.set(id, disk.get(id)); disk.delete(id); return [] },
    getDeletedProjects: async () => [...trash.values()], getDataRoot: async () => 'test-only-data',
    restoreProject: async (id) => { const p = { ...trash.get(id), storageEpoch: 1 }; trash.delete(id); disk.set(id, p); return p },
    saveWorkspace: async () => {}
  } }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', output)(module, module.exports, (id) => {
      if (id.startsWith('@shared/')) return load(path.resolve('src/shared', `${id.slice(8)}.ts`))
      if (!id.startsWith('@/')) return require(id)
      const target = path.join(root, id.slice(2))
      return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
    }, () => 1, () => {})
    return module.exports
  }
  const { createEmptyProject } = load(path.join(root, 'types/index.ts'))
  const { useAppStore: store } = load(path.join(root, 'stores/storyStore.ts'))
  const project = { ...createEmptyProject('race', 'Race'), writingEngine: 'chapter-v2', idea: 'A simple story', duration: 1, enableHook: false,
    outline: { title: 'Story', outlineSummary: 'A story.', chapters: [{ chapter: 1, title: 'End', summary: 'A story.', estimatedWords: 100 }] } }
  store.setState({ projects: [project], activeProjectId: 'race', projectsLoaded: true, openTabs: ['race'] })
  disk.set('race', project)
  const writing = store.getState().confirmAndWrite()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(listeners.size, 1)
  const deletion = store.getState().deleteProject('race')
  const duplicateDeletion = store.getState().deleteProject('race')
  await new Promise((resolve) => setImmediate(resolve))
  for (const listener of listeners.values()) listener('Late content after delete intent.')
  if (ignoreAbort) {
    assert(disk.has('race'), 'delete waits for the in-flight owner to settle')
    resolveRequest('A late completed result that must be ignored.')
  }
  await Promise.all([writing, deletion, duplicateDeletion])
  assert.equal(deleteCalls, 1, 'rapid repeated clicks delete only once without a dialog')
  assert(aborts > 0, 'active generation is cancelled before deletion')
  assert.equal(listeners.size, 0)
  assert.equal(disk.has('race'), false)
  assert.equal(store.getState().projects.length, 0)
  assert.equal(store.getState().openTabs.length, 0)
  assert.equal(store.getState().runtimes.race, undefined)
  assert.equal(trash.get('race').generatedStory, '', 'late response is not committed before deletion')
  await store.getState().restoreProject('race')
  assert.equal(store.getState().getActiveProject().storageEpoch, 1)
  assert.equal(store.getState().getActiveRuntime().isGenerating, false)
  console.log(`PASS: no-dialog deletion cancels/waits for owner, ignores duplicate clicks and late writes; restore fixture remains compatible (ignoreAbort=${ignoreAbort})`)
}
await scenario(false)
await scenario(true)
for (const file of ['src/main/index.ts', 'src/preload/index.ts', 'src/preload/index.d.ts']) {
  assert(!fs.readFileSync(file, 'utf8').match(/confirmDeleteProject|store:confirm-delete-project/), 'confirmation IPC must be removed')
}
