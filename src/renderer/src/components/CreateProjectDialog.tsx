import { useState, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'

export function CreateProjectDialog(): JSX.Element {
  const { createProject, setCreateDialogOpen } = useAppStore()
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    setIsCreating(true)
    await createProject(name.trim())
    setIsCreating(false)
  }

  const handleClose = (): void => {
    setCreateDialogOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && name.trim()) handleCreate()
    if (e.key === 'Escape') handleClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">📁 Tạo dự án mới</h2>
          <button className="modal__close" onClick={handleClose}>✕</button>
        </div>

        <div className="modal__body">
          <div className="form-group">
            <label className="form-label">Tên dự án</label>
            <input
              className="form-input"
              placeholder="VD: Câu chuyện về người lữ khách..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -12 }}>
            Dự án mới giữ các lựa chọn viết gần nhất (hook, ngôn ngữ, thời lượng, tự động), không sao chép nội dung truyện cũ.
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={handleClose}>Hủy</button>
          <button
            className="btn btn--primary"
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? 'Đang tạo...' : 'Tạo dự án'}
          </button>
        </div>
      </div>
    </div>
  )
}
