import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
const module = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/main/chatResponse.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('module', 'exports', code)(module, module.exports)
const { readChatResponse } = module.exports
const packet = (content, finish_reason = 'stop') => ({ choices: [{ message: { content }, finish_reason }] })
assert.equal(readChatResponse(packet('hello')), 'hello')
assert.equal(readChatResponse(packet([{ type: 'text', text: 'a' }, { type: 'reasoning', text: 'PRIVATE' }, { type: 'output_text', text: 'b' }])), 'ab')
for (const data of [packet(''), packet(null), {}, packet('  '), packet([{ type: 'reasoning', text: 'PRIVATE' }])]) assert.throws(() => readChatResponse(data), /API_EMPTY_CONTENT/)
assert.throws(() => readChatResponse(packet('', 'length')), /API_OUTPUT_INCOMPLETE/)
assert.throws(() => readChatResponse(packet('partial', 'length')), /API_OUTPUT_INCOMPLETE/)
assert.throws(() => readChatResponse(packet('', 'content_filter')), /API_REFUSAL/)
assert.throws(() => readChatResponse({ error: { message: 'SECRET' } }), (error) => error.message.includes('API_RESPONSE_ERROR') && !error.message.includes('SECRET'))
assert.throws(() => readChatResponse({ choices: [], usage: {total_tokens:22822,prompt_tokens:20442,completion_tokens_details:{reasoning_tokens:2380}} }), /API_EMPTY_CHOICES.*choices=\[\].*reasoning_tokens=2380/)
console.log('PASS: final text/string blocks, empty, incomplete, refusal and provider error diagnostics without reasoning/secrets')
