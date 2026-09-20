// Explicit live check: uses configured API credits; never run as part of the unit suite.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
if (process.argv.includes('--review-from')) throw new Error('Full-story review has been removed. Use a new writing run or --rewrite-from for chapter memory.')
const configPath = process.argv[2]
const outputDir = process.argv[3]
if (!configPath || !outputDir) throw new Error('Provide config path and a NEW output directory')
fs.mkdirSync(outputDir, { recursive: false })
const root = path.resolve('src/renderer/src')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const resolve = (id) => {
    if (!id.startsWith('@/')) return require(id)
    const target = path.join(root, id.slice(2))
    return load(fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts'))
  }
  new Function('module', 'exports', 'require', output)(module, module.exports, resolve)
  return module.exports
}
const { normalizeSettings, createEmptyProject } = load(path.join(root, 'types/index.ts'))
const { buildChatCompletionBody } = load(path.resolve('src/main/modelResolver.ts'))
const settings = normalizeSettings(JSON.parse(fs.readFileSync(configPath, 'utf8')).settings)
if (!settings.apiKey) throw new Error('Missing configured API key')
console.log(`Live model: ${settings.apiModel || settings.model || '(configured default)'}`)
const url = new URL(`${settings.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`)
const streamListeners = new Map()
const controllers = new Map()
let requests = 0

async function request(messages, options, id, stream = false, detailed = false) {
  if (++requests > 24) throw new Error('Live-check request budget exhausted')
  const requestNumber = requests
  const controller = new AbortController()
  controllers.set(id, controller)
  const timer = setTimeout(() => controller.abort(), 240_000)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(buildChatCompletionBody(settings, messages, options, stream))
    })
    if (!response.ok) throw new Error(`API Error ${response.status}`)
    let text = ''
    let finishReason = null
    let usage = null
    if (!stream) {
      const data = await response.json()
      text = data.choices?.[0]?.message?.content || ''
      finishReason = data.choices?.[0]?.finish_reason || null
      usage = data.usage || null
    } else {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const line = (raw) => {
        if (!raw.startsWith('data:')) return
        const payload = raw.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        const packet = JSON.parse(payload)
        const content = packet.choices?.[0]?.delta?.content
        finishReason = packet.choices?.[0]?.finish_reason || finishReason
        usage = packet.usage || usage
        if (typeof content === 'string') {
          text += content
          streamListeners.get(id)?.(content)
        }
      }
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        lines.forEach(line)
      }
      buffer += decoder.decode()
      if (buffer.trim()) line(buffer)
    }
    fs.writeFileSync(path.join(outputDir, `request-${String(requestNumber).padStart(2, '0')}.json`), JSON.stringify({
      requestNumber, stream, model: buildChatCompletionBody(settings, messages, options, stream).model,
      elapsedMs: Date.now() - started, finishReason, usage, messages, response: text
    }, null, 2))
    console.log(`API ${stream ? 'stream' : 'chat'} completed: ${text.length} chars, ${Math.round((Date.now() - started) / 1000)}s`)
    return detailed ? { text, finishReason } : text
  } finally {
    clearTimeout(timer)
    controllers.delete(id)
  }
}

globalThis.window = { api: {
  chat: (messages, options, id) => request(messages, options, id),
  chatStream: (messages, options, id) => request(messages, options, id, true),
  chatStreamDetailed: (messages, options, id) => request(messages, options, id, true, true),
  onStreamChunk: (id, listener) => {
    streamListeners.set(id, listener)
    return () => streamListeners.delete(id)
  },
  abortRequest: async (id) => { controllers.get(id)?.abort(); return true },
  saveProject: async (project) => {
    fs.writeFileSync(path.join(outputDir, `${project.id}.json`), JSON.stringify(project, null, 2), 'utf8')
    return []
  }
} }
const { useAppStore: store } = load(path.join(root, 'stores/storyStore.ts'))
store.setState({ settings })
const scenarios = [
  ['nguoi-sua-den', 'Một cô thợ sửa đèn phép trong thành phố nổi luôn giành phần thiệt về mình nhưng không chịu nhận là đang giúp người khác. Khi đèn dẫn đường tắt giữa một cơn bão, cô phải cùng một con rồng nhỏ sợ độ cao cứu chiếc thuyền cuối cùng. Không xuyên không, không học viện.'],
  ['hoc-vien-bong', 'Một học viên ma pháp sĩ diện, thích thắng bằng mẹo, phát hiện phép của mình chỉ sửa được đồ vật chứ không thể chiến đấu. Trong buổi thi, cậu phải lựa chọn giữa giành hạng nhất và cứu bài thi của người từng chế nhạo mình. Giữ câu chuyện đời thường trong học viện, hài nhẹ, không thảm họa hay xuyên không.']
]
if (process.argv.includes('--isekai')) {
  scenarios.splice(0, scenarios.length, [
    'isekai-nguoi-sua-dong-ho',
    'Một thợ sửa đồng hồ trẻ ở thành phố hiện đại luôn nhận phần khó nhưng giả vờ chỉ quan tâm tiền công. Khi anh sửa chiếc đồng hồ bỏ túi của một khách lạ, bánh răng mở ra khe sáng và kéo anh sang thành phố ma pháp nơi thời gian đang đứng yên. Anh phải dùng tay nghề cứu một đứa trẻ mắc kẹt trong vòng lặp. Isekai xuyên không rõ ràng, không phải giấc mơ, không tai nạn xe, không học viện. Kết thúc trọn vẹn xung đột chính.'
  ])
}
for (const [id, idea] of scenarios) {
  const resumeIndex = process.argv.indexOf('--rewrite-from')
  const saved = resumeIndex >= 0 ? JSON.parse(fs.readFileSync(process.argv[resumeIndex + 1], 'utf8')) : null
  const project = saved || { ...createEmptyProject(id, id), idea, style: 'custom',
    customStyle: 'Story anime fantasy, giàu hình ảnh, hành động nhân vật tự nhiên',
    language: 'vi', duration: process.argv.includes('--chapter-engine') ? 16 : (process.argv.includes('--chapter-smoke') ? 6 : 3), enableHook: true, autoFlow: true, mode: 'auto' }
  store.setState({ projects: [project], activeProjectId: id, runtimes: {} })
  let last = ''
  const unsubscribe = store.subscribe((state) => {
    const progress = state.runtimes[id]?.generationProgress || ''
    if (progress && progress !== last) { console.log(`${id}: ${progress}`); last = progress }
  })
  if (saved) await store.getState().confirmAndWrite()
  else await store.getState().generateQuestions()
  unsubscribe()
  const final = store.getState().getActiveProject()
  const runtime = store.getState().getActiveRuntime()
  await window.api.saveProject(final)
  fs.writeFileSync(path.join(outputDir, `${id}-logs.json`), JSON.stringify(runtime.logs, null, 2), 'utf8')
  fs.writeFileSync(path.join(outputDir, `${id}-truyen.txt`), final.generatedStory, 'utf8')
  fs.writeFileSync(path.join(outputDir, `${id}.txt`), final.hookText.trim() && !final.generatedStory.startsWith(final.hookText.trim())
    ? `${final.hookText.trim()}\n\n---\n\n${final.generatedStory}` : final.generatedStory, 'utf8')
  if (runtime.error || final.status !== 'done' || !final.generatedStory.trim() || !final.hookText.trim()) {
    console.error(`${id}: incomplete; inspect test-only logs`)
    process.exitCode = 1
    break
  }
  console.log(`DONE ${id}: ${final.generatedStory.length} story chars, ${final.hookText.length} hook chars`)
}
console.log(`Live check finished with ${requests} requests. Output: ${outputDir}`)
