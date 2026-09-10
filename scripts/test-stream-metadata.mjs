import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const main = fs.readFileSync('src/main/index.ts', 'utf8')
const source = main.slice(main.indexOf("ipcMain.handle('api:chat-stream'"), main.indexOf('// --- Project CRUD ---'))
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
let handler
const mod = {exports:{}}
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/main/chatStream.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports)
const {readChatStream}=mod.exports
const requests = new Map()
const tokens = []
new Function('ipcMain', 'store', 'buildApiUrl', 'providerRequest', 'usesResponses', 'activeRequests', 'readChatStream', 'fetch', code)(
  { handle: (_channel, fn) => { handler = fn } }, { get: () => ({ apiKey: 'fixture' }) }, () => 'test-only', () => ({endpoint:'chat/completions',body:{}}), () => false, requests, readChatStream,
  async () => ({ ok: true, body: new ReadableStream({ start(controller) {
    const sse = 'data: {"choices":[{"delta":{"content":"Đồng hồ"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}'
    const bytes = new TextEncoder().encode(sse)
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3))
    controller.close()
  } }) })
)
const event = { sender: { isDestroyed: () => false, send: (_channel, payload) => tokens.push(payload) } }
assert.deepEqual(await handler(event, [], {}, 'new', true), { text: 'Đồng hồ', finishReason: 'length' })
assert.equal(await handler(event, [], {}, 'legacy'), 'Đồng hồ')
assert.equal(requests.size, 0)
assert.deepEqual(tokens.map((p) => p.streamId), ['new', 'legacy'])
console.log('PASS: actual SSE handler preserves UTF-8, final unterminated event and length metadata; legacy string response stays unchanged')
const reader = (s) => new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(s));c.close()}}).getReader()
await assert.rejects(()=>readChatStream(reader('data: {"error":{"message":"hidden"}}\n'),()=>{}),/API_RESPONSE_ERROR/)
await assert.rejects(()=>readChatStream(reader('data: {broken}\n'),()=>{}),/API_STREAM_INVALID/)
await assert.rejects(()=>readChatStream(reader('data: {"choices":[{"delta":{"content":"partial"}}]}\n'),()=>{}),/API_OUTPUT_INCOMPLETE/)
await assert.rejects(()=>readChatStream(reader('data: [DONE]\n'),()=>{}),/API_EMPTY_CONTENT/)
assert.equal((await readChatStream(reader('data:{"choices":[{"delta":{"content":"OK"}}]}\ndata:[DONE]'),()=>{})).text,'OK')
console.log('PASS: error packets, malformed packets, empty replies and prematurely closed streams are never accepted as completed prose')
