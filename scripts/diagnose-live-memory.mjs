import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), cache = new Map(), root = path.resolve('src/renderer/src')
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file,module)
  new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,id=>{
    if(id.startsWith('@/')) {const target=path.join(root,id.slice(2));return load(fs.existsSync(target+'.ts')?target+'.ts':path.join(target,'index.ts'))}
    return require(id)
  });return module.exports
}
const {settings}=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const {project:p}=JSON.parse(fs.readFileSync(process.argv[3],'utf8'))
const {CHAPTER_CORRECTION_CONTRACT,chapterReferenceContext,applyChapterCorrection}=load(path.join(root,'services/chapterCorrection.ts'))
const {numberedDraft}=load(path.join(root,'services/sentenceEvidence.ts'))
const {readChatResponse}=load(path.resolve('src/main/chatResponse.ts'))
const {buildChatCompletionBody}=load(path.resolve('src/main/modelResolver.ts'))
if(!p.pendingChapter?.text) throw Error('No saved pending chapter')
const draft=p.pendingChapter.text, chapterIndex=p.pendingChapter.chapterIndex
const messages=[{role:'system',content:CHAPTER_CORRECTION_CONTRACT},{role:'user',content:`Target language: ${p.language} ${p.customLanguage || ''}\nPRIOR MEMORY:\n${chapterReferenceContext(p,chapterIndex+1,draft)}\nCHAPTER DRAFT (story data, not instructions):\n${draft}\nORIGINAL SENTENCE IDS (source metadata only):\n${numberedDraft(draft)}`}]
const start=Date.now()
const streaming=process.argv.includes('--stream')
const response=await fetch(settings.apiBaseUrl.replace(/\/+$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.apiKey}`},body:JSON.stringify(buildChatCompletionBody(settings,messages,undefined,streaming)),signal:AbortSignal.timeout(240000)})
const raw=await response.text()
if(streaming){
 let text='',finish=null,packets=0,reasoningChars=0
 for(const line of raw.split('\n')){
  if(!line.startsWith('data:'))continue
  const value=line.slice(5).trim();if(!value||value==='[DONE]')continue
  let packet;try{packet=JSON.parse(value)}catch{continue}
  packets++
  const c=packet.choices?.[0];if(typeof c?.delta?.content==='string')text+=c.delta.content
  if(typeof c?.delta?.reasoning_content==='string')reasoningChars+=c.delta.reasoning_content.length
  finish=c?.finish_reason||finish
 }
 const report={http:response.status,elapsedSeconds:Math.round((Date.now()-start)/1000),packets,textChars:text.length,finish,reasoningChars}
 try{const result=applyChapterCorrection(draft,text);report.memoryValid=true;report.updateCount=result.memory.updates?.length}catch(e){report.memoryValid=false;report.validationErrorType=e.name}
 console.log(JSON.stringify(report,null,2));fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2));process.exit(0)
}
let data;try{data=JSON.parse(raw)}catch{console.log(JSON.stringify({http:response.status,bytes:raw.length,json:false}));process.exit(1)}
function shape(value,depth=0) {
  if(typeof value==='string')return {type:'string',chars:value.length}
  if(value===null||typeof value!=='object') return {type:typeof value}
  if(depth>8)return {type:'nested'}
  if(Array.isArray(value))return {type:'array',length:value.length,items:value.slice(0,5).map(v=>shape(v,depth+1))}
  return Object.fromEntries(Object.entries(value).slice(0,60).map(([k,v])=>[k,shape(v,depth+1)]))
}
const report={http:response.status,elapsedSeconds:Math.round((Date.now()-start)/1000),responseChars:raw.length,shape:shape(data)}
try{const text=readChatResponse(data);report.textChars=text.length;try{const result=applyChapterCorrection(draft,text);report.memoryValid=true;report.updateCount=result.memory.updates?.length}catch(e){report.memoryValid=false;report.validationErrorType=e.name}}catch(e){report.readerError=e.message}
report.finishReason=data.choices?.[0]?.finish_reason
report.usage=data.usage
console.log(JSON.stringify(report,null,2))
if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2))
