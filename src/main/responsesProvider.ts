import { buildChatCompletionBody, resolveApiModel, type ModelSettingsLike, type ChatOptionsLike } from './modelResolver'

export function usesResponses(settings: ModelSettingsLike): boolean {
  return settings.apiProvider === 'legacy' && !/:20128\b/.test(settings.apiBaseUrl || '')
}

export function providerRequest(settings: ModelSettingsLike & { maxTokens: number; temperature: number }, messages: unknown, options?: ChatOptionsLike, stream = false): { endpoint: string; body: Record<string, unknown> } {
  if (!usesResponses(settings)) return { endpoint: 'chat/completions', body: buildChatCompletionBody(settings, messages, options, stream) }
  return { endpoint: 'responses', body: { model: resolveApiModel(settings, options?.model), input: messages,
    max_output_tokens: options?.maxTokens ?? settings.maxTokens, store: false, stream } }
}

export function responseText(response: any): string {
  if (response?.error || response?.status === 'failed') throw new Error('[API_RESPONSE_ERROR] Cookpit trả lỗi Responses')
  if (response?.status === 'incomplete') throw new Error('[API_OUTPUT_INCOMPLETE] Cookpit chưa hoàn tất phản hồi')
  const text = (response?.output || []).filter((item: any) => item.type === 'message' && item.role === 'assistant')
    .flatMap((item: any) => item.content || []).filter((part: any) => part.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text).join('')
  if (!text.trim()) throw new Error('[API_EMPTY_CONTENT] Cookpit không trả văn bản đầu ra')
  return text
}

export async function readResponsesStream(reader: ReadableStreamDefaultReader<Uint8Array>, emit: (text: string) => void): Promise<{ text: string; finishReason: string }> {
  let text = '', buffer = '', terminal = false, finishReason = 'stop'
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    buffer += done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim().startsWith('data:')) continue
      const raw = line.trim().slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      const packet = JSON.parse(raw)
      if (packet.type === 'error' || packet.type === 'response.failed') throw new Error('[API_RESPONSE_ERROR] Cookpit stream thất bại')
      if (packet.type === 'response.output_text.delta' && typeof packet.delta === 'string') { text += packet.delta; emit(packet.delta) }
      if (packet.type === 'response.completed') {
        terminal = true
        if (!text) { text = responseText(packet.response); emit(text) }
      }
      if (packet.type === 'response.incomplete') {
        terminal = true
        if (packet.response?.incomplete_details?.reason !== 'max_output_tokens') throw new Error('[API_OUTPUT_INCOMPLETE] Cookpit không hoàn tất stream')
        finishReason = 'length'
      }
    }
    if (done) break
  }
  if (!terminal) throw new Error('[API_OUTPUT_INCOMPLETE] Stream kết thúc nhưng thiếu sự kiện hoàn tất')
  if (!text.trim()) throw new Error('[API_EMPTY_CONTENT] Cookpit stream rỗng')
  return { text, finishReason }
}
