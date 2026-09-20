// Explicit conversion only; requires an approved AI plan, never regenerates prose.
import fs from 'node:fs'
import path from 'node:path'
import { createLoader } from './lib/load-local-ts.mjs'
const [root, id, planFile] = process.argv.slice(2)
if (!root || !id || !planFile) throw new Error('Usage: node scripts/convert-long-story.mjs DATA_ROOT PROJECT_ID APPROVED_PLAN_JSON')
const load = createLoader()
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const { parsePlan } = load('src/renderer/src/services/longStory/planner.ts')
const { convertLegacyProject } = load('src/renderer/src/services/longStory/migration.ts')
const files = new ProjectFileStore(path.resolve(root))
const project = files.list().find(p => p.id === id)
if (!project) throw new Error('Project not found')
const plan = parsePlan(fs.readFileSync(planFile, 'utf8'), project)
files.saveConverted(convertLegacyProject(project, plan))
console.log('Converted with verified per-project backup; original prose preserved.')
