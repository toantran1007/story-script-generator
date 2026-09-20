import fs from 'node:fs'
import { buildChatCompletionBody } from '../src/main/modelResolver.ts'
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).settings
const prompt = `Viết chương một của truyện anime fantasy bằng tiếng Việt, khoảng 5.400 ký tự. Ý tưởng gốc: Một thợ sửa đồng hồ trẻ ở thành phố hiện đại sửa chiếc đồng hồ bỏ túi, bánh răng mở khe sáng kéo anh sang thành phố ma pháp nơi thời gian đứng yên. Đây là isekai rõ ràng. MANDATORY EARLY ISEKAI BEAT: biến cố xuyên không hoặc dấu hiệu đến thế giới khác phải xuất hiện trong 990 ký tự truyện đầu tiên, khoảng 30–60 giây. Bắt đầu bằng hành động nhân vật, đưa thẳng tới biến cố, cho thấy thế giới thay đổi và phản ứng tức thời. Không kể dài sinh hoạt tiệm, khách hàng hay tả cảnh trước biến cố. Sau đó tiếp tục tự nhiên và kết chương rõ ràng. Mỗi câu một dòng. Chỉ trả lời phần truyện.`
const body = buildChatCompletionBody(cfg, [{ role: 'system', content: prompt }, { role: 'user', content: prompt }], { maxTokens: 1125 }, false)
const response = await fetch(`${cfg.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(body) })
if (!response.ok) throw new Error(`API ${response.status}`)
const text = (await response.json()).choices?.[0]?.message?.content || ''
const crossing = text.search(/khe sáng|xuyên không|thế giới khác|bị cuốn|thành phố ma pháp/iu)
console.log(JSON.stringify({ chars: text.length, crossingIndex: crossing, within990: crossing >= 0 && crossing <= 990, finishReason: 'non-stream smoke' }, null, 2))
fs.writeFileSync(process.argv[3], text, 'utf8')
