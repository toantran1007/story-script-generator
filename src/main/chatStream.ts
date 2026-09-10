/** Read only answer deltas; require a terminal marker before accepting a chapter. */
export async function readChatStream(reader: ReadableStreamDefaultReader<Uint8Array>, emit: (text: string) => void): Promise<{ text: string; finishReason: string | null }> {
  const decoder = new TextDecoder()
  let text = '', buffer = '', finishReason: string | null = null, terminal = false
  while (true) {
    const { done, value } = await reader.read()
    buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trimStart().startsWith('data:')) continue
      const raw = line.trim().slice(5).trim()
      if (!raw) continue
      if (raw === '[DONE]') { terminal = true; continue }
      let packet
      try { packet = JSON.parse(raw) } catch { throw new Error('[API_STREAM_INVALID] Gói stream sai JSON; không đánh dấu chương hoàn tất') }
      if (packet.error) throw new Error('[API_RESPONSE_ERROR] Nguồn trả gói lỗi trong stream; chưa chấp nhận nội dung')
      const choice = packet.choices?.[0]
      if (choice?.finish_reason) { finishReason = choice.finish_reason; terminal = true }
      if (choice?.delta?.refusal || finishReason === 'content_filter') throw new Error('[API_REFUSAL] Nguồn từ chối nội dung stream')
      const content = choice?.delta?.content
      const delta = typeof content === 'string' ? content : Array.isArray(content)
        ? content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('') : ''
      if (delta) { text += delta; emit(delta) }
    }
    if (done) break
  }
  if (!terminal) throw new Error('[API_OUTPUT_INCOMPLETE] Kết nối stream kết thúc nhưng thiếu dấu hoàn tất; chưa lưu thành chương hoàn chỉnh')
  if (!text.trim()) throw new Error('[API_EMPTY_CONTENT] Stream kết thúc nhưng không có văn bản trả lời')
  return { text, finishReason }
}
