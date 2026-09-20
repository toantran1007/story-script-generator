// Local editorial repair of explicitly requested projects; no network or original writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createLoader } from './lib/load-local-ts.mjs'
const load = createLoader()
const { applyChapterCorrection } = load('src/renderer/src/services/chapterCorrection.ts')
const { applyMemoryPayload } = load('src/renderer/src/services/detailedMemory.ts')
const { findTextRepetitions } = load('src/shared/textRepetition.ts')
const { hasTargetLanguageLeak } = load('src/renderer/src/services/languageGuard.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const { plainNarration } = load('src/shared/plainNarration.ts')
const out = path.resolve('chapter-boundary-repair-20260920')
fs.mkdirSync(out, { recursive: true })
const report = { localOnly: true, externalCalls: 0, projects: [] }
const sources = ['08449e0f-3ac2-4a58-bbe8-76cd36176eb3', 'f91b39e6-86d3-4a5c-a7c3-3b49c4534c8b']
const staged = []
for (const sourceId of sources) {
  const file = path.resolve('data/projects', sourceId, 'project.json'), bytes = fs.readFileSync(file), original = JSON.parse(bytes).project
  assert(['19-1','19-2'].includes(original.name))
  const id = original.name + '-boundary-repair-20260920'
  assert(!fs.existsSync(path.resolve('data/projects', id)), 'Refuse overwrite')
  let p = { ...original, id, name: original.name + ' — SỬA MẠCH TRUYỆN', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), storageEpoch: 0,
    longStory: undefined, pendingChapter: null, writingMemory: null, writingEngine: 'chapter-v2', status: 'done', outlinePhase: 'done', durationIssue: null,
    generatedStory: '', hookText: '', enableHook: false, chapterDocuments: [], chapterMemories: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], storyMemory: null,
    storyNotes: original.storyNotes + '\nBản biên tập cục bộ ngày 20-09-2026: sửa các lỗi đã xác định về lặp diễn biến, ranh giới chương, ký hiệu và chữ lặp. Bản gốc giữ nguyên. Không phải chứng nhận mọi lỗi ngôn ngữ đã được AI kiểm thật. Báo cáo: chapter-boundary-repair-20260920.' }
  const changes = []
  for (const doc of original.chapterDocuments) {
    const edits = []
    const replace = (before, after, reason) => { assert.equal(doc.text.split(before).length, 2, 'non-unique editorial target'); edits.push({ before, after }); changes.push({ chapter: doc.chapter, before, after, reason }) }
    const payload = structuredClone(original.memoryPackets.find(x => x.chapter === doc.chapter)?.payload)
    assert(payload, 'missing original memory')
    delete payload.evidenceRanges
    for (const u of payload.updates || []) delete u.evidenceSentenceId
    if (original.name === '19-1') {
      if (doc.chapter === 4) {
        replace('「……なるほど、そういうことだったのか」', '「魔王の残留思念が地球の霊脈に寄生していることは、帰還直後から分かっていた。だが、個々のダンジョンが全国規模の一つの受肉陣を形成しているとは。これが新たに判明した仕組みか」', 'Distinguish already-known cause from newly discovered global resurrection mechanism')
        payload.chapter.events = payload.chapter.events.map(s => s.includes('根源が') ? '既知だった魔王の残留思念による霊脈寄生について、各地のダンジョンが一つの巨大な受肉陣を形成するという新たな仕組みが判明した' : s)
        const ch = p.outline.chapters.find(c => c.chapter === 4)
        ch.summary = '管理庁の暗部を退けたハルトは、既知の霊脈寄生が全国のダンジョンを結ぶ巨大な受肉陣を形成していると確認する。魔王が復活し、世界規模の危機が迫る。'
      }
      if (doc.chapter === 5) {
        replace('Please save us! You are our only hope!', 'どうか助けてください。あなたが唯一の希望です。', 'Translate meaningful foreign plea, not delete it')
        replace('Thank you Haruto!! You saved the world!!', 'ありがとう、ハルト。君が世界を救ってくれた。', 'Translate meaningful foreign gratitude')
      }
    } else {
      if (doc.chapter === 4) {
        replace('さらに、男たちの一人が、近隣の崩れかけた家屋から怯えて逃げ遅れた幼い子どもを不可視のマナの手で捕らえ、宙へと吊るし上げた。', '工作員たちは結界への供給を強め、工房からの出口を封じた。', 'Reserve hostage escalation for chapter 5; retain chapter 4 sealing ambush')
        replace('「無駄な抵抗をすれば、この街のガキの首をへし折る。おとなしく魔力を差し出せ」', '「出口は封じた。無駄な抵抗をせず、おとなしく魔力を差し出せ」', 'Remove premature hostage threat')
        replace('人質を取る卑劣な一手。', '退路を断つための封印だった。', 'Same sealing conflict, no extra hostage event')
        replace('展開された暗紫色の結界と、子どもを拘束している術式の幾何学模様', '展開された暗紫色の結界と、工房を囲む術式の幾何学模様', 'Remove dependent hostage reference')
        replace('子どもを吊るし上げていた不可視の手は一瞬で霧散し、落下した子どもはセレスティアが展開した柔らかな光のクッションによって無傷で保護された。', '工房の出口を塞いでいた光の壁が消え、セレスティアは崩れかけた建材を障壁で支えた。', 'Keep aftermath local to barrier dismantling')
        replace('セレスティアもまた、救出した子どもを安全な物陰へと誘導し終え、真剣な面持ちでミナトの手元を覗き込んできた。', 'セレスティアもまた、周囲の安全を確かめ、真剣な面持ちでミナトの手元を覗き込んできた。', 'Dependent transition')
        payload.chapter.summary = 'ミナトたちは王都職人街で魔導具の暴走と理論の改竄を調べる。工作員の封印結界による奇襲を改良術式で破り、工作員を拘束。回収した書物と通信核から焚書と欠陥術式による統制の証拠を掴み、地下拠点への介入を決める。人質救出はこの章では起こらない。'
        payload.chapter.events = payload.chapter.events.map(s => s.replace('封印結界と人質を用いた奇襲', '封印結界を用いた奇襲'))
      }
      if (doc.chapter === 6) {
        const marker = '王宮からは、ミナトを救国の英雄として迎え、公爵の爵位と宮廷筆頭魔導師の座、さらには巨万の富を与えようとする使者が引きも切らずに訪れた。'
        const at = doc.text.indexOf(marker); assert(at > 0)
        replace(doc.text.slice(at), 'ミナトは回収した原典を整理し、失われた知識を一部の支配者だけのものにしてはならないと考えた。公開の方法と理論の体系化は、地上へ戻ってから取り組むべき仕事として残されていた。\n\n組織の支配力は失われた。しかし、奪われた学問を人々の手へ戻す仕事はまだ終わっていない。クラリスとセレスティアと共に、ミナトは回収した書物を携えてギルドへ向かった。', 'Stop chapter 6 after victory; reserve manual/publication/honors and aftermath for chapter 7')
        payload.chapter.summary = 'ミナトたちは地下管制中枢で最高司祭アルゲントスと対決。愚民化統制の思想を論破し、古代次元兵器を安全停止させ、禁忌術式を逆流させて首魁と組織の戦力を無力化した。原典と記録を回収し、世界へ知識を戻すための体系化と公開を今後の仕事としてギルドへ向かう。教範はまだ完成も公開もされていない。'
        payload.chapter.events = payload.chapter.events.filter(s => !/教範|無償|爵位/.test(s))
        payload.chapter.state = ['組織の中枢と首魁が無力化された', '古代次元兵器は安全に停止した', '原典を回収したが、教範の完成と公開は未完了']
        payload.chapter.openThreads = ['回収した原典を体系化し、知識を人々に公開する', '仲間たちと次の探求へ向かう']
        payload.updates = payload.updates.filter(u => !['object_standard_manual', 'fact_magic_degradation'].includes(u.id))
      }
    }
    // Short locally known expression; generic detection stays in shared runtime.
    const spans = findTextRepetitions(doc.text)
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i]
      assert(!edits.some(e => { if (!e.before) return false; const at = doc.text.indexOf(e.before); return at < s.end && at + e.before.length > s.start }), 'overlapping repair')
      const after = /[wｗ]/iu.test(s.unit) ? '笑' : /[?？!！]/u.test(s.unit) ? '。' : s.unit.repeat(2)
      edits.push({ repetitionId: 'R' + (i + 1), after })
      changes.push({ chapter: doc.chapter, repetitionId: 'R' + (i + 1), originalLength: s.end - s.start, after, reason: 'Remove degenerate repetition only' })
    }
    const corrected = applyChapterCorrection(doc.text, JSON.stringify({ edits, memory: payload }))
    assert(!findTextRepetitions(corrected.text).length)
    assert(!hasTargetLanguageLeak(corrected.text, 'ja'))
    assert(!/[^\p{L}\p{M}\p{N}\s.,。、]/u.test(corrected.text))
    const patch = applyMemoryPayload(p, doc.chapter, 0, true, corrected.text, corrected.memory)
    p = { ...p, ...patch, generatedStory: [p.generatedStory, corrected.text].filter(Boolean).join('\n\n') }
  }
  p.hookText = '' // Old teaser may refer to removed/changed scenes; do not reuse it.
  p.outlineSummary = p.outline.outlineSummary
  if (original.name === '19-2') {
    assert(!p.chapterDocuments[3].text.includes('人質'))
    assert(!p.chapterDocuments[5].text.includes('標準魔導教範'))
    assert(p.chapterDocuments[6].text.includes('標準魔導教範'))
  }
  assert.equal(p.chapterDocuments.map(c => c.text).join('\n\n'), p.generatedStory)
  const result = { sourceId, sourceName: original.name, sourceHash: crypto.createHash('sha256').update(bytes).digest('hex'), id, name: p.name,
    changes, timing: estimateWrittenDuration(p), memoryWarnings: p.memoryIssues, originalUnchanged: bytes.equals(fs.readFileSync(file)), pendingChapter: p.pendingChapter }
  staged.push({ p, file, bytes }); report.projects.push(result)
  fs.writeFileSync(path.join(out, original.name + '-CORRECTED.txt'), p.generatedStory)
  fs.writeFileSync(path.join(out, original.name + '-snapshot.json'), JSON.stringify(p, null, 2))
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
// Inspect before installation; never misrepresent uncertain evidence as verified.
if (!process.argv.includes('--install')) { console.log(JSON.stringify(report.projects.map(p=>({name:p.name,changes:p.changes.length,memoryWarnings:p.memoryWarnings.length,timing:p.timing})))); process.exit(0) }
for (const { p, file, bytes } of staged) {
  assert(bytes.equals(fs.readFileSync(file)), 'Source changed during preparation')
  new ProjectFileStore(path.resolve('data')).save(p)
  const saved = JSON.parse(fs.readFileSync(path.resolve('data/projects', p.id, 'project.json'), 'utf8')).project
  assert.equal(saved.generatedStory, p.generatedStory)
  assert(bytes.equals(fs.readFileSync(file)))
}
console.log('Installed two repaired copies; original bytes unchanged')
