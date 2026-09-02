import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync('src/main/modelResolver.ts', 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const module = { exports: {} }
new Function('module', 'exports', output)(module, module.exports)
const { buildChatCompletionBody, isVilaoSettings, normalizeVilaoModelId, resolveApiModel } = module.exports

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`PASS: ${message}`)
}

const oldVilao = { apiProvider: 'vilao', apiBaseUrl: 'https://api.vilao.ai/v1/', model: 'gpt-5.6-sol' }
assert(isVilaoSettings(oldVilao), 'Vilao settings are detected with a trailing slash')
assert(normalizeVilaoModelId('gpt-5.6-sol') === 'cd/gpt-5.6-sol', 'Legacy GPT model is qualified')
assert(normalizeVilaoModelId('gemini-3.7-flash-high') === 'anxs/gemini-3.7-flash-high', 'Legacy Gemini model is qualified')
assert(resolveApiModel(oldVilao) === 'cd/gpt-5.6-sol', 'Persisted Vilao model is qualified before chat requests')
assert(resolveApiModel(oldVilao, 'gemini-3.7-flash-high') === 'anxs/gemini-3.7-flash-high', 'Override model is qualified before stream requests')
assert(resolveApiModel({ apiProvider: 'legacy', apiBaseUrl: 'http://localhost:20128/v1', model: 'custom-model' }) === 'custom-model', 'Non-Vilao models are unchanged')
assert(resolveApiModel({ apiProvider: 'vilao', apiBaseUrl: 'https://api.vilao.ai/v1', model: '', apiProfiles: { vilao: { model: 'gpt-5.6-sol' } } }) === 'cd/gpt-5.6-sol', 'Vilao profile model is used when active model is empty')

const chatBody = buildChatCompletionBody({ ...oldVilao, temperature: 0.8, maxTokens: 4096 }, [{ role: 'user', content: 'test' }])
assert(chatBody.model === 'cd/gpt-5.6-sol', 'Normal chat request body contains the qualified GPT model')
const streamBody = buildChatCompletionBody({ ...oldVilao, temperature: 0.8, maxTokens: 4096 }, [], { model: 'gemini-3.7-flash-high' }, true)
assert(streamBody.model === 'anxs/gemini-3.7-flash-high' && streamBody.stream === true, 'Streaming request body contains the qualified Gemini model')
