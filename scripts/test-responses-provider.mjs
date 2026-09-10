import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
function load(file) {
  const m = { exports: {} }
  new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,()=>load('src/main/modelResolver.ts'))
  return m.exports
}
const { providerRequest, responseText, readResponsesStream } = load('src/main/responsesProvider.ts')
const settings = {apiProvider:'legacy',apiBaseUrl:'http://localhost:64072/v1',model:'gpt-6-astra',maxTokens:4096,temperature:0.8}
const request = providerRequest(settings,[{role:'user',content:'hello'}],undefined,true)
assert.equal(request.endpoint,'responses')
assert.equal(request.body.model,'gpt-6-astra')
assert.equal(request.body.store,false)
assert.equal(request.body.max_output_tokens,4096)
assert(!('messages' in request.body)); assert(!('temperature' in request.body))
assert.equal(providerRequest({...settings,apiProvider:'vilao'},[]).endpoint,'chat/completions')
const result = {status:'completed',output:[{type:'reasoning',content:[]},{type:'message',role:'assistant',content:[{type:'output_text',text:'Xin chào'}]}]}
assert.equal(responseText(result),'Xin chào')
assert.throws(()=>responseText({status:'failed'}))
async function stream(events) {
  const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''))
  const reader=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close()}}).getReader()
  let shown='';const value=await readResponsesStream(reader,t=>shown+=t);return {value,shown}
}
const good=await stream([{type:'response.output_text.delta',delta:'Xin chào'},{type:'response.completed',response:result}])
assert.equal(good.shown,'Xin chào');assert.equal(good.value.finishReason,'stop')
assert.equal((await stream([{type:'response.output_text.delta',delta:'Partial'},{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}])).value.finishReason,'length')
await assert.rejects(()=>stream([{type:'response.failed'}]))
await assert.rejects(()=>stream([{type:'response.output_text.delta',delta:'Partial'}]))
console.log('PASS: Responses request, final output, UTF-8 stream, incomplete/error and legacy provider routing')
