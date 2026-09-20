import { proseFixture } from './lib/prose-fixture.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createLoader } from './lib/load-local-ts.mjs'

const load = createLoader()
const { estimateWrittenDuration, authorEstimatedMinutes, roundedMinutes, TTS_CALIBRATION_ID } = load('src/shared/narrationDuration.ts')
const { exportStoryJSON } = load('src/shared/storyExport.ts')
const { narrationChars } = load('src/renderer/src/services/textMetrics.ts')
const project = { duration: 90, language: 'ja', generatedStory: proseFixture(62500),
  longStory: { plan: { duration: { requestedMinutes: 90, estimatedMinutes: 90, actualEstimatedMinutes: 90 } }, accepted: [{ estimatedMinutes: 90 }] } }
const before = JSON.stringify(project)
assert.equal(estimateWrittenDuration(project).minutes, 170)
assert.equal(estimateWrittenDuration({ ...project, generatedStory: proseFixture(33088) }).minutes, authorEstimatedMinutes(33088, 'ja'))
assert.equal(estimateWrittenDuration({ ...project, generatedStory: ' \n\t ' }).minutes, null)
assert.equal(estimateWrittenDuration({ ...project, language: 'custom', generatedStory: 'Story.', longStory: undefined }).minutes, null)
assert.equal(estimateWrittenDuration({ ...project, language: 'custom' }).source, 'ai-estimate')
assert.equal(estimateWrittenDuration({ ...project, language: 'custom' }, 'Unreviewed stream.').minutes, null)
assert.equal(estimateWrittenDuration({ ...project, language: 'custom', longStory: { accepted: [{ estimatedMinutes: NaN }] } }).minutes, null)
for (const language of ['ja', 'en', 'th', 'vi', 'zh']) {
  const text = '猫。\r\n\n Hello.   World.\t😀'
  assert.equal(estimateWrittenDuration({ language, generatedStory: text }).characters, narrationChars(text, language))
}
assert.equal(JSON.parse(exportStoryJSON(project)).estimatedMinutes, 170)
assert.equal(JSON.stringify(project), before, 'derived duration must not mutate the saved plan or prose')
console.log('PASS: stale/no stored duration, empty prose, streaming, Unicode/spacing parity, unknown languages and JSON all use honest provenance')

if (process.argv.includes('--projects')) {
  const results = []
  const root = path.resolve('data/projects')
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name, 'project.json')
    if (!entry.isDirectory() || !fs.existsSync(file)) continue
    const bytes = fs.readFileSync(file), p = JSON.parse(bytes).project
    if (!['17-1', '17-2'].includes(p.name)) continue
    const timing = estimateWrittenDuration(p), exported = JSON.parse(exportStoryJSON(p))
    assert.equal(exported.estimatedMinutes, roundedMinutes(timing.minutes))
    assert.equal(exported.requestedMinutes, p.duration)
    assert.equal(exported.generatedStory, p.generatedStory)
    assert.deepEqual(fs.readFileSync(file), bytes, 'checking duration must not rewrite the project')
    results.push({ name: p.name, requestedMinutes: p.duration, normalizedCharacters: timing.characters,
      estimatedMinutes: roundedMinutes(timing.minutes), source: timing.source, calibrationId: TTS_CALIBRATION_ID,
      projectUnchanged: true, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
  }
  assert.equal(results.length, 2, 'both named real projects must be checked')
  fs.mkdirSync('live-tts-calibration-20260917', { recursive: true })
  fs.writeFileSync('live-tts-calibration-20260917/written-duration-report.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
