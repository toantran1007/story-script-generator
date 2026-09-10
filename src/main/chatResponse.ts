/** Read only final assistant text; never expose reasoning or raw provider errors. */
export function readChatResponse(data: unknown): string {
  const root = data && typeof data === 'object' ? data as Record<string, any> : {}
  const choice = Array.isArray(root.choices) ? root.choices[0] : undefined
  const content = choice?.message?.content
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter((part) => part && ['text', 'output_text'].includes(part.type) && typeof part.text === 'string').map((part) => part.text).join('') : ''
  const finish = ['stop', 'length', 'content_filter', 'tool_calls', 'function_call'].includes(choice?.finish_reason) ? choice.finish_reason : 'unknown'
  const shape = content === null ? 'null' : Array.isArray(content) ? 'array' : typeof content
  const completion = Number.isSafeInteger(root.usage?.completion_tokens) ? root.usage.completion_tokens : 'unknown'
  const reasoning = Number.isSafeInteger(root.usage?.completion_tokens_details?.reasoning_tokens) ? root.usage.completion_tokens_details.reasoning_tokens : 'unknown'
  const details = `finish_reason=${finish}; content=${shape}; completion_tokens=${completion}; reasoning_tokens=${reasoning}`
  if (root.error) throw new Error(`[API_RESPONSE_ERROR] Nguồn trả đối tượng lỗi trong phản hồi. ${details}`)
  if (finish === 'length') throw new Error(`[API_OUTPUT_INCOMPLETE] Phản hồi hết ngân sách đầu ra (${text.length} ký tự). ${details}. Không tự thử lại cùng cấu hình.`)
  if (finish === 'content_filter' || choice?.message?.refusal) throw new Error(`[API_REFUSAL] Nguồn từ chối nội dung. ${details}`)
  if (!text.trim()) throw new Error(`[API_EMPTY_CONTENT] Không nhận được văn bản trả lời (0 ký tự). ${details}. Đã dừng thử lại tự động; kiểm tra model/cấu hình nguồn trước khi tiếp tục.`)
  return text
}
