import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createLoader } from './lib/load-local-ts.mjs'
import { manualStories } from './lib/manual-proofreading-stories.mjs'
const load = createLoader()
const { createEmptyProject, normalizeSettings } = load('src/renderer/src/types/index.ts')
const { providerRequest, usesResponses, responseText } = load('src/main/responsesProvider.ts')
const { readChatResponse } = load('src/main/chatResponse.ts')
const { estimateWrittenDuration } = load('src/shared/narrationDuration.ts')
const { ProjectFileStore } = load('src/main/projectFiles.ts')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const settings = normalizeSettings(config.settings)
const root = path.resolve(config.projectDataRoot || 'data')
assert.equal(root.toLowerCase(), path.resolve('data').toLowerCase(), 'Data root differs; inspect before installing')
const output = path.resolve('manual-proofreading-20min')
fs.mkdirSync(output, { recursive: true })
let calls = 0
const count = s => [...s.replace(/\s/gu, '')].length
const report = { syntheticOnly: true, intentionalErrors: true, actualTtsMeasured: false, calls: [], projects: [] }
const saveReport = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
async function generate(story) {
  const texts = []
  const target = story.language === 'ja' ? 1840 : 1885
  for (let i = 0; i < story.chapters.length; i++) {
    const chapter = story.chapters[i]
    const file = path.join(output, `${story.language}-chapter-${i + 1}-reference.txt`)
    const anchors = [...chapter.edits.map(e => e.correct), ...chapter.controls]
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    const valid = s => count(s) >= target * .95 && count(s) <= target * 1.07 && anchors.every(a => s.split(a).length === 2)
    for (let attempt = 1; !valid(text) && attempt <= 3; attempt++) {
      assert(++calls <= 24, 'Request cap reached')
      const req = providerRequest(settings, [
        { role: 'system', content: `Write original coherent literary narration in ${story.language === 'ja' ? 'Japanese' : 'Thai'} only. You are writing ONE of four chapters of a 20-minute story. Output prose only, no title, markdown, commentary or JSON. Aim for ${target} characters excluding whitespace, accepted ${Math.ceil(target * .95)} to ${Math.floor(target * 1.07)}. Develop concrete scenes and natural dialogue, not repetitive filler. End this chapter at the specified beat. Include EACH supplied anchor EXACTLY ONCE as a natural sentence or contiguous clause, unchanged; they are synthetic story facts. Maintain chronology and character identity. No new medical claims, treatment instructions or unrelated subplot. Do not describe proofreading or errors in the story.` },
        { role: 'user', content: JSON.stringify({ premise: story.premise, fullPlan: story.chapters.map(c => c.beat), chapter: i + 1, currentBeat: chapter.beat, exactAnchors: anchors,
          previousChapters: texts.join('\n\n'), ...(text ? { previousAttempt: text, feedback: `Previous text has ${count(text)} non-whitespace characters; adjust scene detail to reach ${target}, preserving all anchors exactly once. Missing/duplicated anchors: ${anchors.filter(a => text.split(a).length !== 2).join(' / ')}` } : {}) }) }
      ], { maxTokens: 7000, temperature: .6 }, false)
      const item = { language: story.language, chapter: i + 1, attempt }; report.calls.push(item); saveReport()
      const res = await fetch(settings.apiBaseUrl.replace(/\/+$/, '') + '/' + req.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify(req.body), signal: AbortSignal.timeout(150000) })
      item.http = res.status
      if (!res.ok) throw Error('Generation HTTP ' + res.status)
      const data = await res.json()
      text = (usesResponses(settings) ? responseText(data) : readChatResponse(data)).trim()
      fs.writeFileSync(file, text)
      item.characters = count(text); item.valid = valid(text); saveReport()
      console.log(JSON.stringify(item))
    }
    assert(valid(text), `Invalid length/anchors: ${story.language} chapter ${i + 1}; saved for resume`)
    texts.push(text)
  }
  const reference = texts.join('\n\n')
  let corrupted = reference
  const answers = []
  for (let i = 0; i < story.chapters.length; i++) {
    for (const edit of story.chapters[i].edits) {
      assert.equal(corrupted.split(edit.correct).length, 2, 'Anchor must be unique in whole story')
      corrupted = corrupted.replace(edit.correct, edit.wrong)
      answers.push({ chapter: i + 1, ...edit })
    }
  }
  for (const a of answers) {
    assert.equal(corrupted.split(a.wrong).length, 2, 'Corrupted sentence must be unique')
    a.line = corrupted.slice(0, corrupted.indexOf(a.wrong)).split('\n').length
  }
  const controls = story.chapters.flatMap(c => c.controls)
  assert(controls.every(s => corrupted.includes(s)))
  const timing = estimateWrittenDuration({ language: story.language, generatedStory: corrupted })
  assert(timing.minutes >= 19 && timing.minutes <= 22, 'Not about 20 minutes')
  fs.writeFileSync(path.join(output, `${story.language}-20min-INTENTIONAL-ERRORS.txt`), corrupted)
  fs.writeFileSync(path.join(output, `${story.language}-20min-REFERENCE.txt`), reference)
  fs.writeFileSync(path.join(output, `${story.language}-ANSWER-KEY.json`), JSON.stringify({ intentionalErrorSpans: answers.length, timing, answers, mustPreserve: controls }, null, 2))
  const table = answers.map((a, i) => `| ${i + 1} | ${a.chapter} | ${a.line} | ${a.wrong} | ${a.correct} | ${a.reason} |`).join('\n')
  fs.writeFileSync(path.join(output, `${story.language}-DAP-AN.md`), `# ${story.title} — đáp án đối chiếu\n\nBản thử cố ý sai: ${answers.length} vị trí, một vị trí có thể chứa nhiều lỗi. ${timing.characters} ký tự; khoảng ${timing.minutes.toFixed(1)} phút theo hiệu chỉnh của tool, chưa đo TTS. Chấp nhận cách diễn đạt khác nếu giữ đúng nghĩa, không yêu cầu thay chữ mù. Văn phong phù hợp có thể có biến thể (ví dụ 勧める/薦める); không đánh đồng mọi biến thể với lỗi nghĩa nghiêm trọng.\n\n| # | Chương | Dòng | Câu cố ý sai | Câu tham chiếu | Ngữ cảnh |\n|---|---|---|---|---|---|\n${table}\n\n## Câu đúng cần giữ\n\n${controls.map(c => '- ' + c).join('\n')}\n`)
  const id = `manual-proofread-20min-${story.language}-20260919`
  const dir = path.join(root, 'projects', id)
  assert(!fs.existsSync(dir), 'Refusing to overwrite existing test project')
  const p = { ...createEmptyProject(id, story.name), language: story.language, duration: 20, enableHook: false, status: 'done', currentStep: 3, outlinePhase: 'done', writingEngine: 'chapter-v2',
    idea: story.premise, style: 'custom', customStyle: 'Kịch bản kiểm thử bản ngữ — dữ liệu cố ý sai', generatedStory: corrupted,
    storyNotes: 'BẢN KIỂM THỬ CỐ Ý SAI. Không phải bản đã qua hậu kiểm. Các lỗi được cài để bạn tự kiểm tra, không dùng làm nội dung xuất bản. Đáp án nằm riêng trong manual-proofreading-20min. Khoảng 20 phút là ước tính, chưa có audio.',
    outline: { title: story.title, outlineSummary: story.premise, chapters: story.chapters.map((c, i) => ({ chapter: i + 1, title: `${i + 1}`, summary: c.beat, estimatedWords: 400 })) }, outlineSummary: story.premise,
    chapterDocuments: texts.map((text, i) => { for (const edit of story.chapters[i].edits) text = text.replace(edit.correct, edit.wrong); return { chapter: i + 1, text, complete: true, chunks: [{ chunk: 0, start: 0, end: text.length }] } }) }
  // Use the app's canonical writer; touch only newly created project ids.
  new ProjectFileStore(root).save(p)
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).project
  assert.equal(stored.generatedStory, corrupted)
  assert.equal(fs.readFileSync(path.join(dir, 'story.txt'), 'utf8'), corrupted)
  report.projects.push({ id, name: p.name, title: story.title, language: story.language, characters: timing.characters, estimatedMinutes: timing.minutes, intentionalErrorSpans: answers.length, controlSentences: controls.length, path: dir })
  saveReport(); console.log(JSON.stringify(report.projects.at(-1)))
}
await Promise.all(manualStories.map(generate))
fs.writeFileSync(path.join(output, 'HUONG-DAN.md'), `# Hai kịch bản kiểm thử khoảng 20 phút\n\nCác file INTENTIONAL-ERRORS là bản cố ý sai; REFERENCE và DAP-AN là tài liệu đối chiếu, không gửi cùng đầu vào nếu muốn thử mù. Phạm vi bao gồm các nhóm lỗi bạn đã nêu và một số lỗi mới, không thể bao gồm mọi lỗi của một ngôn ngữ. Không có audio; thời lượng tính từ ký tự theo hiệu chỉnh hiện tại của tool, tiếng Thái vẫn mang tính tạm tính.\n\nHai dự án mới đã được lưu vào kho dữ liệu tool. Mở lại tool khi thuận tiện để nạp chúng, chọn dự án TEST rồi tải TXT. Không bấm viết lại nếu muốn giữ bản cố ý sai. Các dự án cũ không thay đổi. Đáp án chỉ liệt kê lỗi đã cài có chủ đích, không chứng nhận các câu AI sinh còn lại hoàn toàn không lỗi.\n`)
console.log('DONE: both downloadable projects persisted and verified')
