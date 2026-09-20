export async function recoverChapter<T>(run: () => Promise<T>, stopped: () => boolean, progress: (attempt: number) => void): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await run() }
    catch (error) {
      if (stopped() || (error instanceof Error && error.name === 'CancelledError')) throw error
      if (attempt === 3) throw new Error(`Đã thất bại sau 3 lần xử lý chương (đã tự chạy lại 2 lần). Bản nháp được giữ nguyên; cần xử lý thủ công. Chi tiết: ${error instanceof Error ? error.message : String(error)}`)
      progress(attempt + 1)
    }
  }
  throw new Error('Không hoàn tất xử lý chương')
}
