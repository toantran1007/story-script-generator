// Explicit paid smoke test: synthetic text only, no project content.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const cache=new Map()
function load(file){
 if(cache.has(file))return cache.get(file)
 const module={exports:{}}
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,id=>load(path.resolve(path.dirname(file),id+'.ts')))
 cache.set(file,module.exports);return module.exports
}
const {settings}=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const {providerRequest,usesResponses,responseText,readResponsesStream}=load(path.resolve('src/main/responsesProvider.ts'))
const {readChatResponse}=load(path.resolve('src/main/chatResponse.ts'))
const {readChatStream}=load(path.resolve('src/main/chatStream.ts'))
const reports=[]
for(const streaming of [false,true]){
 const request=providerRequest(settings,[{role:'user',content:'Return exactly this JSON with no markdown: {"ok":true}'}],undefined,streaming)
 const started=Date.now(),report={streaming,model:settings.model,endpoint:request.endpoint}
 try{
 const response=await fetch(settings.apiBaseUrl.replace(/\/+$/,'')+'/'+request.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.apiKey}`},body:JSON.stringify(request.body),signal:AbortSignal.timeout(90000)})
 report.http=response.status
 if(!response.ok)throw Error('HTTP '+response.status)
 let text
 if(streaming){const result=await (usesResponses(settings)?readResponsesStream:readChatStream)(response.body.getReader(),()=>{});text=result.text;report.finishReason=result.finishReason}
 else {const data=await response.json();report.choicesCount=data.choices?.length;text=usesResponses(settings)?responseText(data):readChatResponse(data)}
 report.chars=text.length
 try{report.valid=JSON.parse(text).ok===true}catch{report.valid=false}
 }catch(e){report.errorCode=String(e.message).match(/\[API_[A-Z_]+\]/)?.[0]||e.name}
 report.seconds=Math.round((Date.now()-started)/1000);reports.push(report);console.log(JSON.stringify(report))
}
fs.writeFileSync(process.argv[3],JSON.stringify(reports,null,2))
