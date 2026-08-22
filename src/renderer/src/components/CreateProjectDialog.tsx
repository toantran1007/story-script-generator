import { useState, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import type { ProjectType } from '@/types'

export function CreateProjectDialog(): JSX.Element {
  const { createProject, setCreateDialogOpen } = useAppStore()
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('new')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) return
    setIsCreating(true)
    await createProject(name.trim(), projectType)
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
            <label className="form-label">Loại dự án</label>
            <div className="project-type-toggle">
              <button
                className={`project-type-toggle__option ${projectType === 'new' ? 'project-type-toggle__option--active' : ''}`}
                onClick={() => setProjectType('new')}
              >
                <span className="project-type-toggle__icon">✨</span>
                <span className="project-type-toggle__label">Viết mới</span>
                <span className="project-type-toggle__desc">Tạo truyện từ ý tưởng</span>
              </button>
              <button
                className={`project-type-toggle__option ${projectType === 'rewrite' ? 'project-type-toggle__option--active' : ''}`}
                onClick={() => setProjectType('rewrite')}
              >
                <span className="project-type-toggle__icon">🔄</span>
                <span className="project-type-toggle__label">Viết lại</span>
                <span className="project-type-toggle__desc">Cải biên kịch bản có sẵn</span>
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tên dự án</label>
            <input
              className="form-input"
              placeholder={projectType === 'new'
                ? 'VD: Câu chuyện về người lữ khách...'
                : 'VD: Viết lại — Cô bé Lọ Lem phiên bản cyberpunk...'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -12 }}>
            {projectType === 'new'
              ? 'Bạn sẽ nhập ý tưởng, chọn phong cách, và AI sẽ viết truyện từ đầu.'
              : 'Bạn sẽ dán kịch bản gốc, AI phân tích và đề xuất hướng viết lại mới.'}
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
