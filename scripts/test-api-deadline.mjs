import fs from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const source=fs.readFileSync('src/main/index.ts','utf8')
for(const streaming of [false,true]){
 const marker=streaming?"ipcMain.handle('api:chat-stream'":"ipcMain.handle('api:chat'"
 const end=streaming?'// --- Project CRUD ---':'// Streaming API proxy'
 const code=ts.transpileModule(source.slice(source.indexOf(marker),source.indexOf(end)),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 let handler,timer,cleared=false
 const active=new Map()
 new Function('ipcMain','store','providerRequest','buildApiUrl','activeRequests','fetch','setTimeout','clearTimeout',code)(
 {handle:(_,fn)=>handler=fn},{get:()=>({apiKey:'fixture'})},()=>({endpoint:'test',body:{}}),()=>'',active,
 async (_url,opts)=>new Promise((_resolve,reject)=>{opts.signal.addEventListener('abort',()=>reject(Error('aborted')));queueMicrotask(timer)}),
 (fn,ms)=>{assert.equal(ms,300000);timer=fn;return 1},()=>{cleared=true})
 await assert.rejects(()=>handler({},[],{},'request'),/API_WAIT_LIMIT/)
 assert(cleared);assert.equal(active.size,0)
}
console.log('PASS: real IPC handlers abort stalled requests after deadline and clean timers/owner tracking')
