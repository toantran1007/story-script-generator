import { nativeGateResponse } from './lib/native-gate-fixture.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createLoader } from './lib/load-local-ts.mjs'
import { harness } from './test-chapter-memory.mjs'
const load = createLoader()
const { targetLanguage } = load('src/renderer/src/services/targetLanguage.ts')
const { hasTargetLanguageLeak } = load('src/renderer/src/services/languageGuard.ts')
const { planningMessages, planInputKey } = load('src/renderer/src/services/longStory/planner.ts')
const { runLongStory } = load('src/renderer/src/services/longStory/engine.ts')
const { createEmptyProject } = load('src/renderer/src/types/index.ts')
const { writingPreferences } = load('src/renderer/src/services/workspaceSession.ts')
const russian = 'Это русский текст, который не должен сохраняться как японская или тайская история.'
for (const [code, name] of [['ja','Japanese'],['th','Thai'],['en','English'],['vi','Vietnamese'],['ko','Korean'],['zh','Chinese']]) {
  assert.equal(targetLanguage(code, 'Русский'), name)
  assert(hasTargetLanguageLeak(russian, code, 'Русский'))
  const p = { ...createEmptyProject('test','Test'), language: code, customLanguage: 'Русский' }
  assert(!JSON.stringify(planningMessages(p)).includes('Русский'))
  assert.equal(writingPreferences(p).customLanguage, '')
}
assert.equal(targetLanguage('custom','Русский'), 'Русский')
assert(!hasTargetLanguageLeak(russian, 'custom','Русский'))
assert.equal(writingPreferences({language:'custom',customLanguage:'Русский'}).customLanguage, 'Русский')
assert.throws(() => targetLanguage('custom',' '))
const app = harness([], [], 'new')
app.store.setState({ projects: [{ ...app.project, language: 'custom', customLanguage: 'Русский' }] })
app.store.getState().setLanguage('ja')
assert.equal(app.store.getState().getActiveProject().customLanguage, '')
app.store.getState().setLanguage('th')
assert.equal(app.store.getState().getActiveProject().language, 'th')

for (const language of ['ja','th']) {
  const correct = language === 'ja' ? '猫は静かな図書館で本を見守っていた。'.repeat(8) : 'แมวนั่งอยู่ในห้องสมุดและมองดูหนังสืออย่างเงียบสงบ'.repeat(5)
  let p = { ...createEmptyProject('route-'+language,'Route'), language, customLanguage:'Русский', duration:.25, enableHook:false }
  const chapter = {chapter:1,targetCharacters:100,estimatedMinutes:.25,beats:['Watch books','Go home'],ending:'Home'}
  p.longStory = {version:1,plan:{version:1,inputKey:planInputKey(p),canon:['No magic'],duration:{requestedMinutes:.25,estimatedMinutes:.25,targetCharacters:100},chapters:[chapter],outline:{chapters:[{chapter:1,title:'T',summary:'S'}]}},cursor:0,stage:'write',attempt:0,accepted:[],checkpoints:[]}
  let calls=0, wrongCommitted=false
  const ports={read:()=>p,stopped:()=>false,progress:()=>{},save:async patch=>{p=structuredClone({...p,...patch}); if(p.generatedStory.includes(russian))wrongCommitted=true},chat:async()=>{throw Error('unexpected')},stream:async(messages,emit)=>{ const gate = nativeGateResponse(messages); if (gate) return gate;
    calls++; const system=messages[0].content
    assert(!system.includes('Русский'))
    if(calls===1){assert(system.includes(`ONLY in ${targetLanguage(language)}`));emit(russian);return{text:russian,finishReason:'stop'}}
    assert.equal(JSON.parse(messages[1].content).language,targetLanguage(language))
    return{text:JSON.stringify({edits:[{before:russian,after:correct}],review:{passed:true,issues:[],estimatedMinutes:.25,beatsComplete:true,missingBeats:[]},languageReview:{language,complete:true,checks:{meaning:true,orthography:true,entities:true,nativeStyle:true},unresolved:[]},memory:{chapter:{summary:correct,events:[],state:[],openThreads:[]},updates:[{id:'cat',kind:'character',subject:'cat',text:correct,status:'current',importance:'normal',related:[],evidenceSentenceId:'S1'}]}}),finishReason:'stop'}
  }}
  await runLongStory(ports)
  assert.equal(p.status,'done'); assert.equal(calls,2); assert(!wrongCommitted); assert.equal(p.generatedStory,correct)
  p={...p,generatedStory:russian,longStory:{...p.longStory,stage:'write'}}
  await assert.rejects(runLongStory(ports),/Dữ liệu đã lưu sai ngôn ngữ/)
  assert.equal(calls,2,'wrong saved content must block before another paid request')
}
console.log('PASS: all selected languages override inactive Russian custom value; setters, presets, actual write/review routing and wrong-output guard')
if(process.argv.includes('--projects')){
  for(const folder of fs.readdirSync('data/projects')){
    const file=path.join('data/projects',folder,'project.json');if(!fs.existsSync(file))continue
    const bytes=fs.readFileSync(file),p=JSON.parse(bytes).project
    if(!p.name.startsWith('19-'))continue
    console.log(JSON.stringify({name:p.name,selected:p.language,inactiveCustom:p.customLanguage,effective:targetLanguage(p.language,p.customLanguage),wrongStory:hasTargetLanguageLeak(p.generatedStory,p.language,p.customLanguage),wrongDraft:hasTargetLanguageLeak(p.longStory?.draft||'',p.language,p.customLanguage),unchanged:bytes.equals(fs.readFileSync(file))}))
  }
}
