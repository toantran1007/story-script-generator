import fs from 'node:fs'
import ts from 'typescript'

function loadTypeScriptModule(path) {
  const source = fs.readFileSync(path, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', 'require', output)(module, module.exports, () => ({}))
  return module.exports
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`PASS: ${message}`)
}

const prompts = loadTypeScriptModule('src/renderer/src/services/promptEngine.ts')
const metrics = loadTypeScriptModule('src/renderer/src/services/textMetrics.ts')
const types = loadTypeScriptModule('src/renderer/src/types/index.ts')
const originality = loadTypeScriptModule('src/renderer/src/services/originalityCheck.ts')
const apiService = loadTypeScriptModule('src/renderer/src/services/apiService.ts')
const wizardStep1 = fs.readFileSync('src/renderer/src/components/WizardStep1.tsx', 'utf8')
const createDialog = fs.readFileSync('src/renderer/src/components/CreateProjectDialog.tsx', 'utf8')
const wizardStep2 = fs.readFileSync('src/renderer/src/components/WizardStep2.tsx', 'utf8')
const wizardStep3 = fs.readFileSync('src/renderer/src/components/WizardStep3.tsx', 'utf8')
const appCss = fs.readFileSync('src/renderer/src/App.css', 'utf8')
const storyStore = fs.readFileSync('src/renderer/src/stores/storyStore.ts', 'utf8')

assert(types.createEmptyProject('id', 'name').enableHook === true, 'new projects enable hooks')
const staleProject = {
  ...types.createEmptyProject('stale', 'Stale'),
  currentStep: 3,
  status: 'outline',
  outlinePhase: 'idle',
  questions: ['Who is the protagonist?']
}
const recoveredProject = types.recoverStaleProject(staleProject)
assert(recoveredProject.currentStep === 2 && recoveredProject.status === 'questions', 'stale outline snapshots recover to the questions step')
assert(types.recoverStaleProject({ ...staleProject, questions: [] }).currentStep === 1, 'stale projects without questions recover to the input step')
assert(types.recoverStaleProject({ ...staleProject, outlinePhase: 'generating-outline' }).outlinePhase === 'idle', 'interrupted outline generation is reset safely')
assert(metrics.normalizeDuration(0) === 1, 'duration clamps to one minute')
assert(metrics.normalizeDuration(1) === 1, 'duration accepts a one-minute script')
assert(metrics.targetCharsFor(1, 'vi') === 900, 'one Vietnamese minute receives its real character budget')
assert(
  metrics.distributeCharBudget([{ estimatedWords: 100 }], 1, 'zh')[0] === 260,
  'one-minute scripts are not inflated by the old chapter minimum'
)
assert(metrics.normalizeDuration(37.4) === 37, 'duration accepts arbitrary whole minutes')
assert(metrics.normalizeDuration(999) === 600, 'duration clamps to the safe maximum')
assert(
  wizardStep1.includes('onChange={(e) => setDurationInput(e.target.value)}'),
  'duration input keeps the typed value local instead of normalizing every keystroke'
)
assert(
  wizardStep1.includes('onBlur={commitDurationInput}'),
  'duration input commits the normalized value when editing finishes'
)
assert(wizardStep1.includes('window.api.readTxtFile()'), 'new-story wizard can import TXT files')
assert(!createDialog.includes('projectType'), 'new project dialog no longer exposes rewrite projects')
assert(wizardStep2.includes('return <NewStep2 />'), 'step 2 always uses the new-story flow')
assert(wizardStep3.includes('wizard wizard--generating'), 'outline generation uses the compact viewport layout')
assert(wizardStep3.includes('wizard__loading-grid'), 'outline loading placeholders use a horizontal grid')
assert(wizardStep3.includes('retryOutlineStronger'), 'outline failure exposes a stronger-transformation retry')
assert(wizardStep3.includes("!p.outline ?"), 'outline failure does not expose a dead continue button')
assert(!storyStore.includes('buildViSummaryPrompt'), 'outline completion does not call a separate Vietnamese summary API')
assert(!wizardStep3.includes('p.viSummary'), 'outline review no longer renders the unused Vietnamese summary step')
assert(storyStore.includes('viSummary: outline.outlineSummary'), 'legacy summary field reuses the existing outline summary without an API call')
assert(appCss.includes('max-width: 1120px'), 'wizard uses the available width between both window edges')
assert(appCss.includes('grid-template-columns: minmax(0, 1.15fr)'), 'generation placeholders share horizontal space')

const profilePrompt = prompts.buildInspirationProfilePrompt('Một người gác đèn phát hiện bí mật trong ngọn hải đăng.')
assert(profilePrompt.system.includes('inspiration analyst, not a rewriter'), 'source is analyzed instead of rewritten')
assert(profilePrompt.system.includes('forbiddenNames'), 'inspiration profile extracts forbidden names')
const profileAwareQuestions = prompts.buildQuestionsPrompt('SOURCE SHOULD NOT BE FORWARDED', 'dramatic', 'vi', 17, '', '', '', {
  sourceType: 'summary', essence: ['bí mật gia đình'], expansionOpportunities: [], requiredElements: [],
  forbiddenNames: ['Mali'], forbiddenSettings: [], forbiddenObjects: [], forbiddenPlotBeats: [], forbiddenTwists: [],
  creativeBrief: 'Một người yếu thế phải lựa chọn giữa sự thật và an toàn.'
})
assert(!profileAwareQuestions.user.includes('SOURCE SHOULD NOT BE FORWARDED'), 'downstream prompts do not forward raw source text')
assert(prompts.getTransformationRule('develop').minChangedAxes === 5, 'develop level changes at least five axes')
assert(prompts.getTransformationRule('original').minChangedAxes === 7, 'original level changes at least seven axes')
assert(prompts.getTransformationRule('reborn').minChangedAxes === 9, 'reborn level changes at least nine axes')

const profile = {
  sourceType: 'summary', essence: ['bí mật gia đình'], expansionOpportunities: [], requiredElements: [],
  forbiddenNames: ['Mali'], forbiddenSettings: ['Ayutthaya'], forbiddenObjects: ['chiếc vòng'],
  forbiddenPlotBeats: ['tìm thấy chiếc vòng trong đền'], forbiddenTwists: ['người cha là thủ phạm'],
  creativeBrief: 'Một người yếu thế phải lựa chọn giữa sự thật và an toàn.'
}
const freshOutline = {
  title: 'Ngọn gió mùa', outlineSummary: 'Lan điều tra một vụ mất tích ở cảng cá.',
  chapters: [{ chapter: 1, title: 'Cảng cá', summary: 'Lan đối mặt với lời đe dọa.', estimatedWords: 800 }]
}
assert(prompts.getStrongerTransformationLevel('develop') === 'original', 'stronger retry raises develop to original')
assert(prompts.getStrongerTransformationLevel('original') === 'reborn', 'stronger retry raises original to reborn')
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3).system.includes('hardViolations'), 'originality audit distinguishes hard violations')
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3).system.includes('softSimilarities'), 'originality audit distinguishes soft similarities')
assert(originality.findForbiddenFingerprints(freshOutline, profile).length === 0, 'originality check accepts new concrete fingerprints')
const copiedOutline = { ...freshOutline, outlineSummary: 'Mali tìm thấy chiếc vòng trong Ayutthaya.' }
assert(originality.findForbiddenFingerprints(copiedOutline, profile).length === 3, 'originality check catches reused names, settings and objects')
const copiedBeatOutline = { ...freshOutline, outlineSummary: 'Lan tìm thấy chiếc vòng trong đền và phát hiện người cha là thủ phạm.' }
const copiedBeatMatches = originality.findForbiddenFingerprints(copiedBeatOutline, profile)
assert(copiedBeatMatches.includes('tìm thấy chiếc vòng trong đền'), 'originality check catches reused plot beats')
assert(copiedBeatMatches.includes('người cha là thủ phạm'), 'originality check catches reused twists')
assert(apiService.isLlmModel({ id: 'gpt-5.6-sol' }, 'vilao'), 'Vilao LLM model remains available')
assert(!apiService.isLlmModel({ id: 'wan2.7-image-pro' }, 'vilao'), 'Vilao image model is excluded')
assert(!apiService.isLlmModel({ id: 'veo-3.1-fast' }, 'vilao'), 'Vilao video model is excluded')
assert(!apiService.isLlmModel({ id: 'text-embedding-3-large' }, 'vilao'), 'Embedding model is excluded')
assert(apiService.isLlmModel({ id: 'custom-chat-model' }, 'custom'), 'Custom chat model remains available')
assert(apiService.formatModelId({ id: 'gemini-3.7-flash-high', provider_prefix: 'anxs' }, 'vilao') === 'anxs/gemini-3.7-flash-high', 'Vilao model prefix is preserved from API metadata')
assert(types.normalizeVilaoModelId('gpt-5.6-sol') === 'cd/gpt-5.6-sol', 'Legacy Vilao model aliases are upgraded with provider prefix')
assert(types.normalizeVilaoModelId('anxs/gemini-3.7-flash-high') === 'anxs/gemini-3.7-flash-high', 'Fully qualified Vilao model IDs are unchanged')

const softSimilarityReport = prompts.normalizeOriginalityReport({
  passed: false, score: 94, attempt: 3,
  changedAxes: ['setting', 'protagonist', 'conflict', 'mechanics', 'inciting event', 'antagonist', 'ending'],
  reusedFingerprints: [],
  similarPlotBeats: ['A vulnerable protagonist protects family while confronting a growing threat.'],
  sameTwistOrEnding: false,
  feedback: []
}, 'original', [])
assert(softSimilarityReport.passed === true, 'common thematic similarities do not fail an otherwise independent outline')

const hardViolationReport = prompts.normalizeOriginalityReport({
  passed: true, score: 99, attempt: 1,
  changedAxes: ['setting', 'protagonist', 'conflict', 'mechanics', 'inciting event', 'antagonist', 'ending'],
  reusedFingerprints: [],
  similarPlotBeats: [],
  hardViolations: ['Copied signature object'],
  sameTwistOrEnding: false,
  feedback: []
}, 'original', [])
assert(hardViolationReport.passed === false, 'explicit hard originality violations still fail the outline')
assert(hardViolationReport.hardViolations?.length === 1, 'hard originality violations are preserved for user feedback')

const outlineArgs = ['A baker discovers a hidden room', 'dramatic', 'en', 17, [], []]
const hookOutline = prompts.buildOutlinePrompt(...outlineArgs, '', '', '', true)
const naturalOutline = prompts.buildOutlinePrompt(...outlineArgs, '', '', '', false)
assert(hookOutline.system.includes('CREATE AN AUDIENCE HOOK'), 'outline prompt enables hook rules')
assert(
  naturalOutline.system.includes('NATURAL OPENING WITHOUT A FORCED HOOK'),
  'outline prompt enables natural opening rules'
)
assert(!naturalOutline.system.includes('CREATE AN AUDIENCE HOOK'), 'no-hook outline excludes hook contract')
const naturalRewrite = prompts.buildRewriteOutlinePrompt(
  'script', 'analysis', 'direction', 'dramatic', 'en', 17, [], [], '', '', '', false
)
assert(
  naturalRewrite.system.includes('NATURAL OPENING WITHOUT A FORCED HOOK'),
  'rewrite outline supports natural opening rules'
)

const outline = {
  title: 'The Hidden Room',
  outlineSummary: 'A baker finds a room that changes the neighborhood.',
  chapters: [{ chapter: 1, title: 'The Door', summary: 'The baker finds the door.', estimatedWords: 800 }]
}
const baseChunkOptions = {
  chunkIndex: 0,
  totalChunks: 1,
  targetChars: 800,
  isLastChunk: true,
  hookWindowChars: 500,
  previousContext: null
}
const hookChunk = prompts.buildChapterChunkPrompt(outline, 0, 'dramatic', 'en', {
  ...baseChunkOptions,
  enableHook: true
})
const naturalChunk = prompts.buildChapterChunkPrompt(outline, 0, 'dramatic', 'en', {
  ...baseChunkOptions,
  enableHook: false
})
assert(hookChunk.system.includes('AUDIENCE HOOK'), 'chapter prompt includes hook execution')
assert(hookChunk.system.includes('OUTLINE FIDELITY'), 'chapter prompt protects fixed outline facts')
assert(!naturalChunk.system.includes('AUDIENCE HOOK'), 'chapter prompt excludes hook execution')
assert(
  naturalChunk.user.includes('without an audience hook'),
  'no-hook chapter user prompt requests a natural opening'
)

const humorous = prompts.buildChapterChunkPrompt(outline, 0, 'humorous', 'en', {
  ...baseChunkOptions,
  enableHook: false
})
const horror = prompts.buildChapterChunkPrompt(outline, 0, 'horror', 'en', {
  ...baseChunkOptions,
  enableHook: false
})
assert(humorous.system.includes('hài hước'), 'humorous style reaches chapter prompt')
assert(horror.system.includes('rùng rợn'), 'horror style reaches chapter prompt')
assert(humorous.system !== horror.system, 'different styles produce different prompts')

const styleBuilders = [
  ['questions', prompts.buildQuestionsPrompt('idea', 'humorous', 'vi', 17)],
  ['auto answers', prompts.buildAutoAnswerPrompt('idea', ['question'], 'humorous', 'vi')],
  ['outline', prompts.buildOutlinePrompt('idea', 'humorous', 'vi', 17, [], [])],
  ['script analysis', prompts.buildScriptAnalysisPrompt('script', 'humorous', 'vi')],
  ['rewrite outline', prompts.buildRewriteOutlinePrompt('script', 'analysis', 'direction', 'humorous', 'vi', 17, [], [])]
]
for (const [name, prompt] of styleBuilders) {
  assert(prompt.system.includes('hài hước'), `humorous style reaches ${name} prompt`)
}
assert(
  prompts.buildOutlinePrompt('idea', 'dramatic', 'vi', 17, [], []).system.includes('3060-3740'),
  'arbitrary duration produces a proportional outline length target'
)

const customStyle = 'Use clipped sentences and dry observational comedy.'
const custom = prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'en', {
  ...baseChunkOptions,
  enableHook: false,
  customStyle
})
assert(custom.system.includes(customStyle), 'custom style reaches chapter prompt verbatim')
