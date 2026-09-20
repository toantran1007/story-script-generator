import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export function createLoader() {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('module', 'exports', 'require', source)(module, module.exports, id => {
      if (!id.startsWith('.') && !id.startsWith('@/') && !id.startsWith('@shared/')) return require(id)
      const target = id.startsWith('@/') ? path.resolve('src/renderer/src', id.slice(2)) : id.startsWith('@shared/') ? path.resolve('src/shared', id.slice(8)) : path.resolve(path.dirname(file), id)
      return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'))
    })
    return module.exports
  }
  return load
}
