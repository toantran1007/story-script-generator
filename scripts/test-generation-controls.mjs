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
  new Function('module', 'exports', 'require', output)(module, module.exports, (id) => id === '@/services/textMetrics' ? loadTypeScriptModule('src/renderer/src/services/textMetrics.ts') : {})
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
const settingsModal = fs.readFileSync('src/renderer/src/components/SettingsModal.tsx', 'utf8')
const appCss = fs.readFileSync('src/renderer/src/App.css', 'utf8')
const storyStore = fs.readFileSync('src/renderer/src/stores/storyStore.ts', 'utf8')

assert(types.createEmptyProject('id', 'name').enableHook === true, 'new projects enable hooks')
assert(types.createEmptyProject('id', 'name').hookText === '', 'new projects start without a post-production hook')
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
assert(wizardStep1.includes("p.ideaInputType === 'outline'"), 'transformation controls are shown only for outline input')
assert(wizardStep1.includes('Ý tưởng ban đầu sẽ được phát triển trực tiếp'), 'original ideas explain their direct expansion flow')
assert(!createDialog.includes('projectType'), 'new project dialog no longer exposes rewrite projects')
assert(wizardStep2.includes('return <NewStep2 />'), 'step 2 always uses the new-story flow')
assert(wizardStep3.includes('wizard wizard--generating'), 'outline generation uses the compact viewport layout')
assert(wizardStep3.includes('wizard__loading-grid'), 'outline loading placeholders use a horizontal grid')
assert(wizardStep3.includes('retryOutlineStronger'), 'outline failure exposes a stronger-transformation retry')
assert(wizardStep3.includes("!p.outline ?"), 'outline failure does not expose a dead continue button')
assert(!storyStore.includes('buildViSummaryPrompt'), 'outline completion does not call a separate Vietnamese summary API')
assert(storyStore.includes("const isOriginalIdea = p.ideaInputType === 'idea'"), 'original ideas skip source transformation analysis')
assert(fs.readFileSync('src/renderer/src/App.tsx', 'utf8').includes('flushProjects'), 'session state has a synchronous close checkpoint')
assert(!wizardStep3.includes('p.viSummary'), 'outline review no longer renders the unused Vietnamese summary step')
assert(storyStore.includes('viSummary: outline.outlineSummary'), 'legacy summary field reuses the existing outline summary without an API call')
assert(appCss.includes('max-width: 1120px'), 'wizard uses the available width between both window edges')
assert(appCss.includes('grid-template-columns: minmax(0, 1.15fr)'), 'generation placeholders share horizontal space')
assert(settingsModal.includes('api-model-refresh'), 'settings expose a dedicated model refresh button')
assert(settingsModal.includes('api-model-picker--stacked'), 'settings allow manual full model ids alongside discovered models')
assert(settingsModal.includes('modelsWithCurrent'), 'settings preserve a manually configured model when the catalog is stale')
assert(settingsModal.includes('handleRemoveStaleModel'), 'settings can remove a stale Vilao model')
assert(settingsModal.includes('REMOVED_VILAO_MODELS_KEY'), 'stale Vilao model removals are persisted locally')

const profilePrompt = prompts.buildInspirationProfilePrompt('Một người gác đèn phát hiện bí mật trong ngọn hải đăng.')
assert(profilePrompt.system.includes('inspiration analyst, not a rewriter'), 'source is analyzed instead of rewritten')
assert(profilePrompt.system.includes('forbiddenNames'), 'inspiration profile extracts forbidden names')
assert(profilePrompt.system.includes('genreCore'), 'inspiration profile extracts genre core separately')
assert(profilePrompt.system.includes('settingEraCore'), 'inspiration profile extracts world and era constraints')
assert(profilePrompt.system.includes('selected genre has priority'), 'selected genre takes priority over source genre')
assert(profilePrompt.system.includes('NOT forbidden plot beats'), 'genre conventions are not misclassified as copied plot beats')
assert(profilePrompt.system.includes('weak student'), 'generic genre progression is excluded from forbidden beats')
const profileAwareQuestions = prompts.buildQuestionsPrompt('SOURCE SHOULD NOT BE FORWARDED', 'dramatic', 'vi', 17, '', '', '', {
  sourceType: 'summary', essence: ['bí mật gia đình'], expansionOpportunities: [], requiredElements: [],
  sourceGenreTags: ['political drama'], genreCore: ['family mystery'], storyCore: ['a hidden truth'],
  settingEraCore: ['present-day city; no future technology'],
  progressionCore: ['clues reveal the truth'], audiencePromise: ['concrete discoveries'], avoidGenreDrift: ['political debate'],
  forbiddenNames: ['Mali'], forbiddenSettings: [], forbiddenObjects: [], forbiddenPlotBeats: [], forbiddenTwists: [],
  creativeBrief: 'Một người yếu thế phải lựa chọn giữa sự thật và an toàn.'
})
assert(!profileAwareQuestions.user.includes('SOURCE SHOULD NOT BE FORWARDED'), 'downstream prompts do not forward raw source text')
assert(profileAwareQuestions.system.includes('GENRE FIDELITY CONTRACT'), 'questions enforce selected genre fidelity')
assert(profileAwareQuestions.system.includes('explicit world, era, technology level'), 'explicit idea setting constraints override generic style labels')
assert(profileAwareQuestions.system.includes('For isekai, reincarnation, regression'), 'common isekai and reincarnation grammar is preserved generically')
assert(prompts.getTransformationRule('develop').minChangedAxes === 5, 'develop level changes at least five axes')
assert(prompts.getTransformationRule('original').minChangedAxes === 7, 'original level changes at least seven axes')
assert(prompts.getTransformationRule('reborn').minChangedAxes === 9, 'reborn level changes at least nine axes')

const profile = {
  sourceType: 'summary', essence: ['bí mật gia đình'], expansionOpportunities: [], requiredElements: [],
  sourceGenreTags: ['political drama'], genreCore: ['family mystery'], storyCore: ['a hidden truth'],
  settingEraCore: ['present-day city; no future technology'],
  progressionCore: ['clues reveal the truth'], audiencePromise: ['concrete discoveries'], avoidGenreDrift: ['political debate'],
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
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3).system.includes('settingFidelityScore'), 'originality audit checks setting and era fidelity')
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3, 'custom', 'anime fantasy academy level-up').user.includes('GENRE FIDELITY CONTRACT'), 'originality audit receives selected genre contract')
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3, 'custom', 'anime fantasy academy level-up').system.includes('reusable genre grammar'), 'audit allows required genre conventions while checking their implementation')
assert(prompts.buildOriginalityAuditPrompt(freshOutline, profile, 'original', 3, 'custom', 'anime fantasy academy level-up').system.includes('at least two distinctive'), 'audit requires distinctive evidence before blocking shared genre grammar')
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
assert(apiService.extractModelIds({ data: [
  { model_id: 'gpt-5.6-sol', model_type: 'text', provider_prefix: 'cd' },
  { id: 'gemini-3.7-flash-high', type: 'text', provider_prefix: 'anxs' },
  { model_id: 'wan2.7-image', model_type: 'image', provider_prefix: 'alic' }
] }, 'vilao').join('|') === 'cd/gpt-5.6-sol|anxs/gemini-3.7-flash-high', 'Vilao model list keeps all text models and excludes media models')
assert(apiService.extractModelIds({ models: {
  first: { id: 'cd/gpt-5.6-sol', type: 'text' },
  second: { model_id: 'anxs/gemini-3.7-flash-high', model_type: 'text' }
} }, 'vilao').length === 2, 'model list parser supports object envelopes')
assert(apiService.extractModelIds([
  { id: 'gpt-5.6-sol', model_type: 'text', provider_prefix: 'cd' },
  { id: 'gpt-5.6-sol', model_type: 'text', provider_prefix: 'cd' }
], 'vilao').length === 1, 'model list parser supports root arrays and deduplicates models')
assert(apiService.extractModelIds({ data: { models: [
  { model: 'gpt-5.6-sol', type: 'text' },
  { name: 'wan2.7-image', type: 'image' }
] } }, 'vilao').join('|') === 'cd/gpt-5.6-sol', 'model list parser supports nested model/name records')
assert(apiService.extractModelIds({ data: [
  { id: 'wan2.7-image', model_type: 'image' },
  { id: 'veo-3.1-fast', model_type: 'video' },
  { id: 'gpt-5.6-sol', model_type: 'text', provider_prefix: 'cd' },
  { id: 'gemini-3.7-flash-high', model_type: 'text', provider_prefix: 'ram' }
] }, 'vilao').join('|') === 'cd/gpt-5.6-sol|ram/gemini-3.7-flash-high', 'current Vilao mixed catalog exposes every LLM model')
assert(apiService.extractModelIds({ data: [
  { id: 'gpt-5.6-sol', model_type: 'text', owned_by: 'cd' },
  { id: 'gpt-5.6-sol', model_type: 'text', owned_by: 'aaa' }
] }, 'vilao').join('|') === 'cd/gpt-5.6-sol|aaa/gpt-5.6-sol', 'same Vilao model name keeps distinct provider prefixes')
assert(types.normalizeVilaoModelId('gpt-5.6-sol') === 'cd/gpt-5.6-sol', 'Legacy Vilao model aliases are upgraded with provider prefix')
assert(types.normalizeVilaoModelId('anxs/gemini-3.7-flash-high') === 'anxs/gemini-3.7-flash-high', 'Fully qualified Vilao model IDs are unchanged')

const softSimilarityReport = prompts.normalizeOriginalityReport({
  passed: false, score: 94, attempt: 3,
  changedAxes: ['setting', 'protagonist', 'conflict', 'mechanics', 'inciting event', 'antagonist', 'ending'],
  reusedFingerprints: [],
  similarPlotBeats: ['A vulnerable protagonist protects family while confronting a growing threat.'],
  sameTwistOrEnding: false,
  genreFidelityScore: 94,
  genreEvidence: ['The family mystery drives every chapter.'],
  missingGenreElements: [],
  genreDrift: [],
  settingFidelityScore: 96,
  settingEvidence: ['Present-day city remains grounded in current technology.'],
  settingDrift: [],
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
  genreFidelityScore: 96,
  genreEvidence: ['The selected genre drives the outline.'],
  missingGenreElements: [],
  genreDrift: [],
  settingFidelityScore: 96,
  settingEvidence: ['Present-day city remains grounded in current technology.'],
  settingDrift: [],
  feedback: []
}, 'original', [])
assert(hardViolationReport.passed === false, 'explicit hard originality violations still fail the outline')
assert(hardViolationReport.hardViolations?.length === 1, 'hard originality violations are preserved for user feedback')

const genreDriftReport = prompts.normalizeOriginalityReport({
  passed: true, score: 95, attempt: 3,
  changedAxes: ['setting', 'protagonist', 'conflict', 'mechanics', 'inciting event', 'antagonist', 'ending'],
  reusedFingerprints: [], similarPlotBeats: [], sameTwistOrEnding: false,
  genreFidelityScore: 54, genreEvidence: ['One level-up scene'],
  missingGenreElements: ['academy training and exams'], genreDrift: ['political reform dominates the ending'],
  settingFidelityScore: 96, settingEvidence: ['The required world and era remain intact.'], settingDrift: [], feedback: []
}, 'original', [])
assert(genreDriftReport.passed === false, 'genre drift fails an otherwise original outline')
assert(genreDriftReport.usableWithWarning === true, 'best originality-safe outline remains usable after retry limit')
const settingDriftReport = prompts.normalizeOriginalityReport({
  passed: true, score: 99, attempt: 3,
  changedAxes: ['protagonist', 'occupation', 'goal', 'geography', 'conflict', 'relationships', 'mechanics', 'reveal', 'ending'],
  reusedFingerprints: [], similarPlotBeats: [], sameTwistOrEnding: false,
  genreFidelityScore: 96, genreEvidence: ['Commerce remains central.'], missingGenreElements: [], genreDrift: [],
  settingFidelityScore: 40, settingEvidence: [], settingDrift: ['Contemporary world replaced by a futuristic city.'], feedback: []
}, 'original', [])
assert(settingDriftReport.passed === false, 'future setting drift fails the outline')
assert(settingDriftReport.usableWithWarning === false, 'setting drift cannot use the best outline fallback')

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
assert(hookChunk.system.includes('STORY VIDEO VISUAL RULES'), 'chapter prompt writes visual story-video beats')
assert(hookChunk.system.includes('DIRECT SERIALIZED SCRIPT STYLE'), 'chapter prompt uses direct serialized script style')
assert(hookChunk.system.includes('visible system panel'), 'chapter prompt localizes on-screen system text')
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
assert(prompts.buildOutlinePrompt('idea', 'dramatic', 'vi', 17, [], []).system.includes('STORY VIDEO VISUAL RULES'), 'outline prompt plans visual story-video beats')
assert(prompts.buildOutlinePrompt('idea', 'dramatic', 'vi', 17, [], []).system.includes('DIRECT SERIALIZED SCRIPT STYLE'), 'outline prompt plans direct serialized prose')
const postStoryHook = prompts.buildPostStoryHookPrompt('A completed story scene with a real consequence.', 'dramatic', 'en', 1200)
assert(postStoryHook.system.includes('completed script'), 'post-production hook reads the completed script')
assert(postStoryHook.system.includes('Never invent a new scene'), 'post-production hook cannot invent disconnected events')
assert(postStoryHook.system.includes('Do not reveal the final resolution'), 'post-production hook protects the ending')
assert(postStoryHook.system.includes('DIRECT SERIALIZED SCRIPT STYLE'), 'post-production hook follows direct serialized prose')
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
const genreContract = prompts.buildGenreFidelityContract('custom', 'anime fantasy academy level-up', profile)
assert(genreContract.includes('THE SELECTED TAG ALWAYS WINS'), 'selected tag is an explicit binding contract')
assert(genreContract.includes('political debate'), 'genre drift directions are explicitly blocked')
assert(genreContract.includes('Student or academy life as an active setting'), 'academy tag expands into concrete genre anchors')
assert(genreContract.includes('Visible progression loop'), 'level-up tag expands into progression requirements')
assert(genreContract.includes('clearly fantastical world'), 'fantasy tag prevents realistic social-drama substitution')
assert(genreContract.includes('WORLD / ERA CORE TO PRESERVE'), 'genre contract preserves world and era core')
const crossWorldContract = prompts.buildGenreFidelityContract('custom', 'anime xuyên không giao thương', null)
assert(!crossWorldContract.includes('A clearly fantastical world'), 'cross-world wording alone does not force a fantasy civilization')
assert(crossWorldContract.includes("preserve each named world's own era"), 'cross-world genre anchor preserves each world era')
assert(prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'en', {
  ...baseChunkOptions, customStyle: 'anime fantasy academy level-up', inspirationProfile: profile, enableHook: false
}).system.includes('GENRE FIDELITY CONTRACT'), 'chapter writing enforces genre fidelity')
const animeFantasyOpening = prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'en', {
  ...baseChunkOptions, customStyle: 'anime fantasy isekai', inspirationProfile: profile, enableHook: false
}).system
assert(animeFantasyOpening.includes('ANIME FANTASY ADAPTIVE OPENING'), 'anime fantasy opening adapts its pace to the premise')
assert(animeFantasyOpening.includes('an unmistakable sign of arrival'), 'isekai opening reveals the world crossing rather than teasing it')
assert(animeFantasyOpening.includes('observable choices, behavior, gestures'), 'opening reveals personality through action')
assert(animeFantasyOpening.includes('Do not apply a fixed template'), 'opening strategy adapts instead of forcing a formula')
assert(animeFantasyOpening.includes('image-rich entry'), 'anime fantasy opening is visual and brisk')
assert(!animeFantasyOpening.includes('first three to five short paragraphs'), 'opening no longer imposes a paragraph formula')
assert(animeFantasyOpening.includes('Outline background is a reference, not a narration checklist'), 'writing does not recite outline backstory upfront')
const adaptiveFirstChunk = prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'vi', {
  ...baseChunkOptions, customStyle: 'anime fantasy', enableHook: false
})
assert(adaptiveFirstChunk.user.includes('silently revise any detached exposition'), 'first segment reviews exposition before returning')
assert(adaptiveFirstChunk.system.includes('Do not preface the scene with a scenic tour'), 'natural opening does not demand a scenic or biographical preamble')
assert(prompts.buildOutlinePrompt('A repair apprentice takes an exam.', 'custom', 'vi', 3, [], [], 'anime fantasy').system
  .includes('not a list of personality traits or a history of the world'), 'outline plans scene behavior instead of upfront biography')
assert(postStoryHook.system.includes('without a fixed sequence of beats'), 'post-production hook adapts to its actual source scene')
for (const enableHook of [true, false]) {
  const first = prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'vi', {
    ...baseChunkOptions, customStyle: 'anime fantasy isekai', enableHook, firstMinuteChars: 900
  })
  assert(first.system.includes('450–900 narrated characters'), 'isekai pacing estimate works with hook on or off')
  assert(first.system.includes('whether the hook option is on or off'), 'isekai early-incident preference applies without forcing a timestamp')
  assert(first.system.includes('not a fixed timestamp or a character ceiling'), 'isekai estimate is not a hard response limit')
  assert(first.system.includes('not shot numbers, camera commands or a checklist'), 'isekai action remains illustration-ready narrative prose')
}
assert(prompts.isekaiFirstMinuteRules(1200).includes('600–1200 narrated characters'), 'custom reading speed changes the pacing reference only')
assert(prompts.isekaiFirstMinuteRules().includes('roughly the first thirty to sixty seconds'), 'isekai incident favors 30–60 seconds without a fixed timestamp')
assert(prompts.isekaiFirstMinuteRules().includes('Never pad until thirty seconds'), 'opening does not stretch setup to fill a timing quota')
assert(!prompts.isekaiFirstMinuteRules().includes('first third'), 'opening is not divided into rigid timed fractions')
assert(prompts.hasIsekaiPremise('Anh thợ xuyên không sang thế giới ma pháp.'), 'explicit isekai premise is recognized')
assert(prompts.hasIsekaiPremise('A repairer.', 'anime isekai'), 'isekai style is recognized')
assert(!prompts.hasIsekaiPremise('Không xuyên không, chỉ học viện phép thuật.', 'fantasy'), 'negated isekai is excluded')
assert(!prompts.hasIsekaiPremise('No isekai.', 'anime isekai'), 'explicit premise exclusion wins over style')
assert(!prompts.hasIsekaiPremise('Same-world regression and rebirth.', 'fantasy'), 'ordinary fantasy and regression are not misclassified as isekai')
assert(prompts.isekaiFirstMinuteRules().includes('respect explicit exclusions'), 'non-isekai and same-world regression are exempt')
assert(!prompts.isekaiFirstMinuteRules(NaN).includes('NaN'), 'invalid optional speed does not leak into the prompt')
assert(prompts.buildOutlinePrompt('A repairer crosses into a magic world.', 'dramatic', 'vi', 3, [], [], '', '', '', false, null, 'original', [], 900)
  .system.includes('450–900 narrated characters'), 'outline carries soft early-incident guidance even without an isekai style tag')
assert(prompts.buildPostStoryHookPrompt('A repairer crossed worlds.', 'dramatic', 'vi', 1800, '', '', null, 900)
  .system.includes('450–900 narrated characters'), 'exported hook carries the same soft isekai pacing guidance')
const laterChunk = prompts.buildChapterChunkPrompt(outline, 0, 'custom', 'vi', {
  ...baseChunkOptions, chunkIndex: 1, customStyle: 'isekai', enableHook: false, firstMinuteChars: 900
}).system
assert(!laterChunk.includes('ISEKAI EARLY-INCIDENT GUIDANCE'), 'continuations do not repeat the opening instructions')
assert(laterChunk.includes('do not restart introductions'), 'later segments preserve scene continuity')
assert(animeFantasyOpening.includes('Reveal personality through observable choices'), 'hook opening prioritizes character action over explanation')
const dramaticOpening = prompts.buildChapterChunkPrompt(outline, 0, 'dramatic', 'en', {
  ...baseChunkOptions, enableHook: false
}).system
assert(!dramaticOpening.includes('ANIME FANTASY ADAPTIVE OPENING'), 'non-fantasy opening is not forced into fantasy beats')
assert(storyStore.includes('buildPostStoryHookPrompt'), 'full-story completion invokes the shared hook editor')
assert(storyStore.includes('enableHook: false'), 'chapter writing no longer forces a disconnected opening hook')
assert(wizardStep1.includes('Tạo hook hậu kỳ'), 'hook checkbox describes post-production behavior')
assert(wizardStep3.includes('regenerateHook'), 'story output can retry the generated hook')
assert(wizardStep3.includes('formatStoryWithHook(p.generatedStory, p.hookText'), 'copy action includes the generated hook with sentence formatting')
assert(!naturalChunk.system.includes('Break into a new paragraph every 2-4 sentences'), 'writing no longer requests grouped paragraphs')
assert(naturalChunk.system.includes('each complete sentence on its own line'), 'writing requests one sentence per line')
assert(storyStore.includes('Đang phân tích nguồn tham khảo để chắt lọc điểm đặc sắc...'), 'source analysis log uses concrete wording')
assert(!storyStore.includes('hồ sơ cảm hứng trừu tượng...'), 'source analysis log does not expose abstract internal wording')
