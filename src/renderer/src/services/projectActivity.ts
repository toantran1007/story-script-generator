import type { Project } from '@/types'
import type { WizardRuntime } from '@/stores/storyStore'

export function projectActivity(project: Project, runtime?: Partial<WizardRuntime>): { label: string; detail: string; color: string; percent: number } {
  const total = project.writingMemory?.totalChapters || project.outline?.chapters.length || 0
  const completed = project.writingMemory?.completedChapters ?? (project.status === 'done' ? total : project.chapterMemories?.filter((m) => m.complete).length || 0)
  const percent = total ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : 0
  const draft = project.pendingChapter
  const checkpoint = draft ? `Chương ${draft.chapterIndex + 1}: ${draft.truncated ? 'chờ viết nối' : 'chờ sửa cục bộ/memory'} · bản nháp ${draft.text.length.toLocaleString('vi-VN')} ký tự`
    : project.writingMemory ? `Đã lưu ${completed}/${total} chương · chờ tiếp tục` : ''
  const result = (label: string, detail: string, color: string) => ({ label, detail, color: `var(--${color})`, percent })
  if (runtime?.isCancelling) return result('Đang dừng', 'Đang chờ tác vụ kết thúc an toàn', 'warning')
  if (runtime?.error) return result('Gặp lỗi', `${runtime.lastAction === 'generateHook' ? 'Tạo hook lỗi · truyện đã xong, vẫn tải được' : runtime.lastAction === 'generateQuestions' ? 'Tạo câu hỏi lỗi' : runtime.lastAction === 'generateOutline' ? 'Tạo dàn ý lỗi' : 'Viết/sửa truyện lỗi'}${checkpoint ? ` · ${checkpoint}` : ''} · Mở dự án xem lỗi`, 'error')
  if (runtime?.isLoadingQuestions || runtime?.isGenerating) {
    const label = runtime.isLoadingQuestions ? 'Đang tạo câu hỏi' : runtime.lastAction === 'generateHook' ? 'Đang tạo hook' : runtime.lastAction === 'generateOutline' ? 'Đang tạo dàn ý' : 'Đang viết'
    return result(label, runtime.generationProgress || (draft ? `Chương ${draft.chapterIndex + 1}: đang xử lý bản nháp` : total ? `Đang xử lý chương ${Math.min(completed + 1, total)}/${total}` : 'Đang xử lý'), 'accent')
  }
  if (project.writingMemory || draft || project.status === 'writing') return result('Tạm dừng', checkpoint || 'Không có tác vụ đang chạy · mở dự án để tiếp tục', 'warning')
  if (project.status === 'done') return result('Hoàn thành', 'Truyện đã xong · sẵn sàng tải về', 'success')
  if (project.status === 'questions') return result('Chờ trả lời', 'Chờ trả lời câu hỏi hoặc tạo dàn ý', 'text-muted')
  if (project.status === 'outline') return result('Chờ xác nhận', 'Chờ xác nhận dàn ý để bắt đầu viết', 'text-muted')
  return result('Bản nháp', 'Chưa chạy · đang thiết lập ý tưởng', 'text-muted')
}
