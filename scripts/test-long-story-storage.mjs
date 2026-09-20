import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const { convertLegacyProject } = load('src/renderer/src/services/longStory/migration.ts')
const { parsePlan } = load('src/renderer/src/services/longStory/planner.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { historyCheckpoints } = load('src/renderer/src/services/longStory/memory.ts')
const { knowledgeTerms } = load('src/renderer/src/services/longStory/terms.ts')
const { exportStoryJSON } = load('src/shared/storyExport.ts')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kichban-long-storage-'))
const files = new ProjectFileStore(root)
const outline = { title: 'Sample', outlineSummary: 'Same story.', chapters: [{ chapter: 1, title: 'One', summary: 'The first chapter.', estimatedWords: 100 }] }
const original = { ...createEmptyProject('old-project', 'Old project'), writingEngine: 'chapter-v2', duration: 1, language: 'en', outline,
  generatedStory: 'Accepted prose.', chapterDocuments: [{ chapter: 1, complete: true, text: 'Accepted prose.', chunks: [{ chunk: 0, start: 0, end: 15 }] }] }
files.save(original)
const temp = path.join(root, 'projects', original.id, 'temp')
assert(fs.statSync(temp).isDirectory())
fs.writeFileSync(path.join(temp, 'sample.txt'), 'temporary material')
const plan = parsePlan(JSON.stringify({ outline, canon: ['No magic'], duration: { requestedMinutes: 1, estimatedMinutes: 1, targetCharacters: 500, rationale: 'Author anchor' }, chapters: [{ chapter: 1, targetCharacters: 500, estimatedMinutes: 1, beats: ['First action', 'Last action'], ending: 'Rest.' }] }), original)
const converted = convertLegacyProject(original, plan)
assert.equal(converted.generatedStory, original.generatedStory)
assert.deepEqual(converted.chapterDocuments, original.chapterDocuments)
files.saveConverted(converted)
assert(fs.readdirSync(path.join(root, 'projects', original.id, 'archives')).some(n => n.startsWith('before-long-story-')))
assert.throws(() => files.saveConverted({ ...converted, generatedStory: 'changed' }), /preserve/)
files.archive(original.id)
assert.equal(files.list().length, 0)
assert.equal(files.listDeleted().length, 1)
assert.throws(() => files.save(converted), /deleted/)
const restored = files.restore(original.id)
assert.equal(restored.generatedStory, original.generatedStory)
assert(fs.existsSync(path.join(temp, 'sample.txt')))
files.remove(original.id)
assert(!fs.existsSync(temp))
const json = exportStoryJSON({ ...converted, apiKey: 'secret', settings: { apiKey: 'secret' } })
assert(!json.includes('secret'))
assert.equal(JSON.parse(json).generatedStory, original.generatedStory)
assert(knowledgeTerms('図書館の鍵').has('図書'))
assert(knowledgeTerms('ห้องสมุด').size > 1)
const memoryProject = { ...original, chapterMemories: Array.from({ length: 22 }, (_, i) => ({ chapter: i + 1, complete: true, summary: 'Summary ' + i, events: [], state: [], openThreads: [] })) }
const checkpoints = historyCheckpoints(memoryProject)
assert.equal(checkpoints.length, 3)
memoryProject.chapterMemories[0].summary = 'Changed'
assert.notEqual(historyCheckpoints(memoryProject)[0].sourceKey, checkpoints[0].sourceKey)
console.log('PASS: temp lifecycle, backed-up conversion, archive/restore, no late resurrection, export secrets and revision-aware history')
console.log(root)
