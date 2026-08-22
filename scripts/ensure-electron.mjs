import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = resolve(projectRoot, 'node_modules', 'electron')
const pathFile = resolve(electronDir, 'path.txt')
const installScript = resolve(electronDir, 'install.js')

function hasElectronBinary() {
  if (!existsSync(pathFile)) return false
  const executable = readFileSync(pathFile, 'utf8').trim()
  return executable.length > 0 && existsSync(resolve(electronDir, 'dist', executable))
}

if (hasElectronBinary()) {
  console.log('[OK] Electron binary is installed')
  process.exit(0)
}

if (!existsSync(installScript)) {
  console.error('[X] Electron package is missing. Run npm install first.')
  process.exit(1)
}

console.log('[...] Electron binary is missing; downloading it now')
const result = spawnSync(process.execPath, [installScript], {
  cwd: electronDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }
})

if (result.status !== 0 || !hasElectronBinary()) {
  console.error('[X] Electron binary installation failed')
  process.exit(result.status || 1)
}

console.log('[OK] Electron binary installed successfully')
