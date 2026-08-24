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

assert(types.createEmptyProject('id', 'name').enableHook === true, 'new projects enable hooks')
assert(metrics.normalizeDuration(0) === 5, 'duration clamps to the safe minimum')
assert(metrics.normalizeDuration(37.4) === 37, 'duration accepts arbitrary whole minutes')
assert(metrics.normalizeDuration(999) === 600, 'duration clamps to the safe maximum')

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
