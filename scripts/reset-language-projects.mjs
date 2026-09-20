// Explicit user-requested recovery for the four 19-x language-incident projects.
// No API calls. Requires the desktop app closed; backups precede every reset.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createLoader } from './lib/load-local-ts.mjs'

const root = path.resolve('D:/kichban/data/projects')
const targets = [
  ['ebc4a764-08fc-42b4-b319-02953e783c15', '19-1', 'ja'],
  ['0fa9a5e4-8c20-4d4f-82ee-48b6ded282fb', '19-2', 'ja'],
  ['233ac6cd-1b13-4f3f-8414-8a9431781475', '19-3', 'th'],
  ['143e7c0a-ad2b-4be4-9dae-d916a2959e6e', '19-4', 'th']
]
const kept = ['id', 'name', 'createdAt', 'storageEpoch', 'projectType', 'idea', 'ideaInputType', 'transformationLevel', 'storyNotes', 'style', 'customStyle', 'language', 'duration', 'enableHook', 'readingSpeed', 'mode', 'autoFlow', 'originalScript', 'userDirection']
const load = createLoader()
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function filesIn(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    assert(!fs.lstatSync(full).isSymbolicLink(), 'Refusing a linked backup/reset target')
    if (entry.isDirectory()) files.push(...filesIn(full))
    else files.push(full)
  }
  return files
}
const originals = targets.map(([id, name, language]) => {
  const directory = path.join(root, id)
  assert.equal(path.dirname(directory), root)
  assert(!fs.lstatSync(directory).isSymbolicLink())
  const project = JSON.parse(fs.readFileSync(path.join(directory, 'project.json'), 'utf8')).project
  assert.equal(project.id, id); assert.equal(project.name, name); assert.equal(project.language, language)
  return { directory, project, files: filesIn(directory) }
})
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ targets: originals.map(({ project:p })=>({name:p.name,language:p.language,ideaCharacters:p.idea.length})), action:'verified backup, preserve inputs, reset generated results to step 1' }, null, 2))
  process.exit(0)
}
const running = execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -eq 'D:\\kichban\\node_modules\\electron\\dist\\electron.exe' }).Count"], { encoding:'utf8', windowsHide:true }).trim()
assert.equal(running, '0', 'Close Kichban before resetting its projects')
const backup = path.resolve('D:/kichban/backups', 'before-language-reset-' + new Date().toISOString().replace(/[:.]/g,'-'))
fs.mkdirSync(backup, { recursive: true })
const manifest = []
for (const { directory, project, files } of originals) {
  const copy = path.join(backup, project.id)
  fs.cpSync(directory, copy, { recursive:true, dereference:false })
  for (const file of files) {
    const relative = path.relative(directory, file), checksum = hash(file)
    assert.equal(hash(path.join(copy, relative)), checksum, 'Backup verification failed')
    manifest.push({ projectId:project.id, file:relative, sha256:checksum })
  }
}
fs.writeFileSync(path.join(backup,'manifest.json'), JSON.stringify({createdAt:new Date().toISOString(),files:manifest},null,2))
const store = new ProjectFileStore(path.dirname(root))
for (const { project:original } of originals) {
  const p = { ...original, ...createEmptyProject(original.id, original.name) }
  for (const key of kept) if (Object.hasOwn(original,key)) p[key] = original[key]
  p.language = targets.find(([id])=>id===p.id)[2]
  p.customLanguage = ''
  p.pendingChapter = null
  p.durationIssue = null
  delete p.longStory
  delete p.preReviewStory
  delete p.qualityReviewState
  p.updatedAt = new Date(Math.max(Date.now(), Date.parse(original.updatedAt) + 1)).toISOString()
  store.save(p)
}
const reloaded = store.list()
for (const { project:original } of originals) {
  const p = reloaded.find(p=>p.id===original.id)
  for (const key of kept) if (Object.hasOwn(original,key)) assert.deepEqual(p[key],original[key], 'Changed input field: '+key)
  assert.equal(p.currentStep,1); assert.equal(p.status,'draft'); assert.equal(p.outlinePhase,'idle')
  assert.equal(p.customLanguage,''); assert.equal(p.writingEngine,'long-v3')
  assert.equal(p.generatedStory,''); assert.equal(p.hookText,''); assert.equal(p.outline,null)
  assert.equal(p.writingMemory,null); assert.equal(p.pendingChapter,null); assert.equal(p.longStory,undefined)
  assert.equal(p.questions.length,0); assert.deepEqual(p.answers,{})
  for(const field of ['chapterDocuments','chapterMemories','memoryRecords','memoryHistory','memoryPackets','memoryIssues']) assert.equal(p[field].length,0)
  assert.equal(fs.readFileSync(path.join(root,p.id,'story.txt'),'utf8'),'')
  assert.equal(fs.readdirSync(path.join(root,p.id,'chapters')).length,0)
}
const report = {backup,verifiedFiles:manifest.length,results:reloaded.filter(p=>targets.some(([id])=>id===p.id)).map(p=>({name:p.name,language:p.language,customLanguage:p.customLanguage,step:p.currentStep,status:p.status,ideaCharacters:p.idea.length,generatedCharacters:p.generatedStory.length})),recoverable:true,apiCalls:0}
fs.writeFileSync(path.join(backup,'reset-report.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
