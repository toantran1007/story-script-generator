import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = path.resolve('src/renderer/src')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kichban-session-test-'))
const diskPath = path.join(directory, 'workspace.json')
const read = () => JSON.parse(fs.readFileSync(diskPath, 'utf8'))
const write = (value) => fs.writeFileSync(diskPath, JSON.stringify(value), 'utf8')
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function boot() {
  const cache = new Map()
  const timers = new Map()
  let timerId = 0
  let reads = 0
  const faults = { save: false, flush: false, load: false }
  const api = {
    getProjects: async () => { reads++; if (faults.load) throw Error('read denied'); return read().projects },
    getWorkspace: async () => read().workspaceSession,
    saveProject: async (project) => {
      if (faults.save) throw Error('write denied')
      const disk = read()
      disk.projects = [...disk.projects.filter((p) => p.id !== project.id), project]
      write(disk)
      return disk.projects
    },
    saveWorkspace: async (workspaceSession) => { if (faults.save) throw Error('write denied'); write({ ...read(), workspaceSession }) },
    flushProjects: (projects, workspaceSession) => {
      if (faults.flush) throw Error('write denied')
      const incoming = new Set(projects.map((p) => p.id))
      write({ ...read(), projects: [...read().projects.filter((p) => !incoming.has(p.id)), ...projects], workspaceSession })
    },
    deleteProject: async (id) => { const disk = read(); disk.projects = disk.projects.filter((p) => p.id !== id); write(disk); return disk.projects }
  }
  globalThis.window = { api }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    new Function('module', 'exports', 'require', 'setTimeout', 'clearTimeout', transpile(fs.readFileSync(file, 'utf8')))(
      module, module.exports, (id) => {
        if (!id.startsWith('@/')) return require(id)
        const target = path.join(root, id.slice(2))
        return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
      }, (callback) => { timers.set(++timerId, callback); return timerId }, (id) => timers.delete(id)
    )
    return module.exports
  }
  const types = load(path.join(root, 'types/index.ts'))
  const session = load(path.join(root, 'services/workspaceSession.ts'))
  const { useAppStore: store } = load(path.join(root, 'stores/storyStore.ts'))
  return { store, api, faults, timers, types, session, reads: () => reads }
}

let app = boot()
const p1 = { ...app.types.createEmptyProject('p1', '9-1'), idea: 'A test idea',
  enableHook: false, language: 'vi', duration: 5, autoFlow: true, status: 'writing', currentStep: 3,
  generatedStory: 'Test story', updatedAt: '2026-09-09T10:00:00Z' }
const p2 = { ...app.types.createEmptyProject('p2', '9-2'), updatedAt: '2026-09-09T10:01:00Z' }
write({ projects: [p2, p1], workspaceSession: null })
await Promise.all([app.store.getState().loadProjects(), app.store.getState().loadProjects()])
assert.equal(app.reads(), 1, 'initial load is deduplicated')
assert.equal(app.store.getState().activeProjectId, 'p1')
await app.store.getState().createProject('9-3')
let project = app.store.getState().getActiveProject()
assert.equal(project.enableHook, false)
assert.equal(project.language, 'vi')
assert.equal(project.duration, 5)
assert.equal(project.autoFlow, true)
assert.equal(project.idea, '')
assert.equal(project.generatedStory, '')
assert.equal(project.writingMemory, null)
assert.deepEqual(read().projects.find((p) => p.id === 'p2'), p2, 'older project is not changed to new preferences')
assert.equal(await app.store.getState().saveNow(), true)
const newId = project.id
console.log('PASS: 9-1 choices inherited by a new project, empty newer draft and story content are not inherited')

app = boot()
await app.store.getState().loadProjects()
assert.equal(app.store.getState().activeProjectId, newId, 'exact active tab restored even when its draft is empty')
assert.deepEqual(app.store.getState().openTabs, ['p1', newId])
const state = app.store.getState()
state.setLanguage('ja'); state.setDuration(77); state.setEnableHook(false); state.setAutoFlow(true); state.setReadingSpeed(0)
assert.equal(app.timers.size, 1, 'continuous edits do not keep delaying autosave')
state.goToDashboard()
assert.equal(await state.saveNow(), true)
const disk = read()
disk.projects.find((p) => p.id === 'p1').updatedAt = '2099-01-01T00:00:00Z'
write(disk)
app = boot(); await app.store.getState().loadProjects()
assert.equal(app.store.getState().currentView, 'dashboard')
await app.store.getState().createProject('9-4')
project = app.store.getState().getActiveProject()
assert.equal(project.duration, 77)
assert.equal(project.language, 'ja')
assert.equal(project.enableHook, false)
assert.equal(project.readingSpeed, 0)
assert.equal(project.autoFlow, true)
console.log('PASS: last user choices survive restart and background generation timestamps')

app.store.getState().setDuration(92)
app.faults.save = true
assert.equal(await app.store.getState().saveNow(), false)
assert(app.store.getState().saveError)
app.faults.save = false
assert.equal(await app.store.getState().saveNow(), true)
assert.equal(read().projects.find((p) => p.id === project.id).duration, 92)
app.store.getState().setDuration(93)
app.faults.flush = true
assert.equal(app.store.getState().flushProjects(), false)
app.faults.flush = false
assert.equal(app.store.getState().flushProjects(), true)
assert.equal(read().projects.find((p) => p.id === project.id).duration, 93)
app = boot(); await app.store.getState().loadProjects()
assert.equal(app.store.getState().getActiveProject().duration, 93)
console.log('PASS: failed writes remain dirty, retry succeeds, close checkpoint preserves latest edits without waiting for timer')

let unblock
const originalSave = app.api.saveProject
let intercepted = false
app.api.saveProject = async (project) => {
  if (!intercepted) { intercepted = true; await new Promise((resolve) => { unblock = resolve }) }
  return originalSave(project)
}
app.store.getState().setDuration(94)
const saving = app.store.getState().saveNow()
await Promise.resolve()
app.store.getState().setDuration(95)
unblock()
await saving
await app.store.getState().saveNow()
assert.equal(read().projects.find((p) => p.id === app.store.getState().activeProjectId).duration, 95)
assert.equal(read().workspaceSession.writingPreferences.duration, 95)
app.store.getState().resetWizard()
assert.equal(app.store.getState().getActiveProject().duration, 95)
assert.equal(app.store.getState().getActiveProject().language, 'ja')
assert.equal(app.store.getState().getActiveProject().enableHook, false)
assert.equal(app.store.getState().getActiveProject().autoFlow, true)
await app.store.getState().saveNow()
console.log('PASS: edits during an in-flight save are not cleared; reset keeps choices')

let acknowledge
const savedApi = app.api.saveProject
app.api.saveProject = async (value) => {
  const result = await savedApi(value)
  await new Promise((resolve) => { acknowledge = resolve })
  return result
}
app.store.getState().setDuration(96)
const beforeClose = app.store.getState().saveNow()
await new Promise((resolve) => setImmediate(resolve))
app.store.getState().setDuration(97)
assert.equal(app.store.getState().flushProjects(), true)
acknowledge()
await beforeClose
assert.equal(read().workspaceSession.writingPreferences.duration, 97, 'late save acknowledgement cannot overwrite the close checkpoint with old preferences')
assert.equal(read().projects.find((p) => p.id === app.store.getState().activeProjectId).duration, 97)
console.log('PASS: final close checkpoint wins over delayed autosave acknowledgement')

const { restoreWorkspace, writingPreferences } = app.session
assert.deepEqual(restoreWorkspace({ openTabs: ['deleted', 'p1', 'p1'], activeProjectId: 'deleted', currentView: 'project' }, [p1]).openTabs, ['p1'])
assert.equal(restoreWorkspace({ openTabs: [], currentView: 'dashboard' }, [p1]).activeProjectId, null)
assert.equal(writingPreferences({ enableHook: false, autoFlow: false, readingSpeed: 0 }).autoFlow, false)
app = boot(); app.faults.load = true
await app.store.getState().createProject('must-not-create')
assert.equal(app.store.getState().projectsLoaded, false)
assert(app.store.getState().saveError)
assert(!read().projects.some((p) => p.name === 'must-not-create'))
console.log('PASS: stale tab ids are pruned, intentional dashboard stays closed, failed load never overwrites saved data')

// Execute the real final-checkpoint IPC handler with isolated storage.
const main = fs.readFileSync('src/main/index.ts', 'utf8')
const handlerSource = main.slice(main.indexOf("ipcMain.on('store:flush-projects'"), main.indexOf("ipcMain.handle('file:read-txt'"))
let handler
const storage = { projects: [p1] }
let failMain = false
new Function('ipcMain', 'store', 'files', transpile(handlerSource))({ on: (_name, callback) => { handler = callback } }, {
  get: (key) => storage[key],
  set: (key, value) => { if (failMain) throw Error('disk denied'); if (typeof key === 'object') Object.assign(storage, key); else storage[key] = value }
}, () => ({ save: (project) => {
  if (failMain) throw Error('disk denied')
  storage.projects = [...storage.projects.filter((p) => p.id !== project.id), project]
} }))
const ack = {}
handler(ack, [{ ...p1, duration: 7 }], { openTabs: ['p1'] })
assert.equal(ack.returnValue.success, true)
assert.equal(storage.projects[0].duration, 7)
failMain = true
handler(ack, [{ ...p1, duration: 8 }], {})
assert.equal(ack.returnValue.success, false)
console.log('PASS: actual main-process checkpoint acknowledges success or failure')

const preload = fs.readFileSync('src/preload/index.ts', 'utf8')
const flushBridgeSource = preload.slice(preload.indexOf('  flushProjects:'), preload.indexOf('  deleteProject:'))
let sent
let reply = { success: true }
const bridge = new Function('ipcRenderer', `${transpile(`const api = { ${flushBridgeSource} };`)}\nreturn api;`)(
  { sendSync: (...args) => { sent = args; return reply } }
)
bridge.flushProjects([p1], { openTabs: ['p1'] })
assert.equal(sent[0], 'store:flush-projects')
assert.equal(sent[2].openTabs[0], 'p1')
reply = { success: false, error: 'disk denied' }
assert.throws(() => bridge.flushProjects([p1]), /disk denied/)
console.log('PASS: actual preload bridge uses synchronous acknowledgement and propagates disk errors')

const appSource = fs.readFileSync('src/renderer/src/App.tsx', 'utf8')
const flushSource = appSource.slice(appSource.indexOf('    const flush ='), appSource.indexOf("    window.addEventListener('beforeunload'"))
const events = []
const event = { preventDefault: () => events.push('blocked') }
new Function('window', 'useAppStore', 'event', transpile(`${flushSource}\nflush(event)`))(
  { dispatchEvent: (event) => events.push(event.type) },
  { getState: () => ({ flushProjects: () => { events.push('flush'); return false } }) }, event
)
assert.deepEqual(events, ['app:commit-inputs', 'flush', 'blocked'])
console.log('PASS: pending inputs commit before final flush, failed flush prevents closing')
console.log(`Isolated test snapshots: ${directory}`)
