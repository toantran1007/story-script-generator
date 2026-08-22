import type { JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'

/**
 * Nút dừng tác vụ AI của dự án đang mở.
 * Chỉ hiển thị khi có tác vụ đang chạy; phần đã viết được giữ nguyên để "Viết tiếp".
 */
export function StopButton({ full = false }: { full?: boolean }): JSX.Element | null {
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const stopGeneration = useAppStore((s) => s.stopGeneration)

  if (!runtime.isGenerating && !runtime.isLoadingQuestions) return null

  return (
    <button
      className={`btn btn--danger ${full ? '' : 'btn--sm'}`}
      onClick={stopGeneration}
      disabled={runtime.isCancelling}
      title="Dừng tác vụ AI đang chạy"
    >
      {runtime.isCancelling ? '⏳ Đang dừng...' : '⏹ Dừng'}
    </button>
  )
}
