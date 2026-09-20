// Run only after live acceptance and with the desktop app CLOSED.
// Archives exactly the two projects present before this integration, never new ones.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createLoader } from './lib/load-local-ts.mjs'
const root = path.resolve('data')
if (root.toLowerCase() !== 'd:\\kichban\\data') throw Error('Unexpected data root')
const ids = ['acbffbe5-6cb2-4d4c-8d8f-bf0c0a06dcf3', 'b6f4f389-ce28-4f5e-8bc3-0a71a200e550']
for (const [folder, id] of [['live-long-story-acceptance-20260916', 'live-ja'], ['live-long-story-en-20260916', 'live-en'], ['live-long-story-th-20260916', 'live-th']]) {
  const report = JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8'))
  if (!report.results.some(r => r.id === id && r.passed)) throw Error('Real API acceptance incomplete: ' + id)
}
const resilience = JSON.parse(fs.readFileSync('live-long-story-resilience-20260916/report.json', 'utf8'))
if (!resilience.interruptedStream || !resilience.resumed || !resilience.contradictionRepaired) throw Error('Real recovery/consistency acceptance incomplete')
if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ ready: true, targets: ids, action: 'verified backup then recoverable archive', requires: 'close Kichban before --apply' })); process.exit(0) }
const running = execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -eq 'D:\\kichban\\node_modules\\electron\\dist\\electron.exe' }).Count"], { encoding: 'utf8', windowsHide: true }).trim()
if (running !== '0') throw Error('Close Kichban before archiving; no project was moved')
const backup = path.resolve('backups', 'accepted-long-story-' + new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(backup, { recursive: true })
fs.cpSync(root, path.join(backup, 'data'), { recursive: true, dereference: false })
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const manifest = []
function verify(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Refusing linked project data')
    const source = path.join(directory, entry.name)
    if (entry.isDirectory()) verify(source)
    else {
      const relative = path.relative(root, source), hash = digest(source)
      if (hash !== digest(path.join(backup, 'data', relative))) throw Error('Backup mismatch: ' + relative)
      manifest.push({ file: relative, sha256: hash })
    }
  }
}
verify(root)
const load = createLoader(), { ProjectFileStore } = load('src/main/projectFiles.ts')
const checkRoot = path.join(backup, 'restore-verification')
fs.cpSync(path.join(backup, 'data'), checkRoot, { recursive: true })
const restored = new ProjectFileStore(checkRoot).list()
const files = new ProjectFileStore(root)
const present = files.list()
for (const id of ids) {
  const current = present.find(p => p.id === id)
  if (!current) continue
  const check = restored.find(p => p.id === id)
  if (!check || JSON.stringify(current) !== JSON.stringify(check)) throw Error('Restore comparison failed: ' + id)
}
fs.writeFileSync(path.join(backup, 'verified-manifest.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), files: manifest, projectIds: ids }, null, 2))
for (const id of ids) if (present.some(p => p.id === id)) files.archive(id)
if (files.list().some(p => ids.includes(p.id))) throw Error('Archive did not remove active project')
console.log(JSON.stringify({ backup, archived: files.listDeleted().filter(p => ids.includes(p.id)).map(p => ({ id: p.id, name: p.name })), recoverable: true }))
