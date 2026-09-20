// REAL provider test with newly authored synthetic premises, never reads manuscripts.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { providerRequest, usesResponses, readResponsesStream } = load('src/main/responsesProvider.ts')
const { readChatStream } = load('src/main/chatStream.ts')
const settings = normalizeSettings(JSON.parse(fs.readFileSync(process.argv[2],'utf8')).settings)
const output = path.resolve('live-long-story-language-' + new Date().toISOString().replace(/[:.]/g,'-'))
fs.mkdirSync(output,{recursive:true})
const report = { syntheticOnly:true, model:settings.model, calls:[], results:[] }
const saveReport = () => fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2))
let count=0
for(const language of ['ja','th']) {
  let p = {...createEmptyProject('language-'+language,'Language check'),language,customLanguage:'Русский',duration:1,enableHook:false,
    idea:'A librarian puts one returned book back on its shelf, closes the library, and walks home. A peaceful everyday scene with no magic or new subplot.'}
  const ch = {chapter:1,targetCharacters:450,estimatedMinutes:1,beats:['Return one book to its shelf','Close the library and go home'],ending:'The librarian reaches home.'}
  p.longStory={version:1,cursor:0,stage:'write',attempt:0,accepted:[],checkpoints:[],plan:{version:1,inputKey:planInputKey(p),canon:['One returned book.'],duration:{requestedMinutes:1,estimatedMinutes:1,targetCharacters:450,source:'ai-estimate'},chapters:[ch],outline:{title:'Library',outlineSummary:'Book returned.',chapters:[{chapter:1,title:'Evening',summary:ch.beats.join('. '),estimatedWords:100}]}}}
  const ports={read:()=>p,stopped:()=>false,save:async patch=>{p={...p,...patch};fs.writeFileSync(path.join(output,language+'-checkpoint.json'),JSON.stringify(p,null,2))},progress:(message,text)=>{if(text===undefined)console.log(language+': '+message)},chat:async()=>{throw Error('Unexpected nonstreaming request')},stream:async(messages,emit,options)=>{
    assert(++count<=10,'Paid request limit reached')
    assert(!JSON.stringify(messages).includes('Русский'),'inactive custom language leaked into actual request')
    const req=providerRequest(settings,messages,options,true), start=Date.now()
    const item={number:count,language,model:settings.model};report.calls.push(item);saveReport()
    try {
      const res=await fetch(settings.apiBaseUrl.replace(/\/+$/,'')+'/'+req.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.apiKey}`},body:JSON.stringify(req.body),signal:AbortSignal.timeout(120000)})
      item.http=res.status;if(!res.ok)throw Error('HTTP '+res.status)
      const result=await(usesResponses(settings)?readResponsesStream:readChatStream)(res.body.getReader(),emit)
      item.chars=result.text.length;return result
    }finally{item.seconds=Math.round((Date.now()-start)/1000);saveReport();console.log(JSON.stringify(item))}
  }}
  try {
    await runLongStory(ports)
    assert.equal(p.status,'done')
    const text=p.generatedStory, cyrillic=(text.match(/\p{Script=Cyrillic}/gu)||[]).length
    assert.equal(cyrillic,0)
    assert(language==='ja'?/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text):/\p{Script=Thai}/u.test(text))
    report.results.push({language,passed:true,status:p.status,chars:text.length,cyrillic,inactiveCustom:'Русский',requestsWithoutInactiveCustom:true})
    fs.writeFileSync(path.join(output,language+'.txt'),text)
  }catch(error){report.results.push({language,passed:false,error:String(error.message).replaceAll(settings.apiKey||'\0','[REDACTED]')});process.exitCode=1;saveReport();break}
  saveReport()
}
report.passed=report.results.length===2&&report.results.every(r=>r.passed);saveReport();console.log(JSON.stringify({output,...report}))
