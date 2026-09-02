import type { JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { countText } from '@/services/textMetrics'
import { STYLE_LABELS, LANGUAGE_LABELS, STATUS_LABELS } from '@/types'
import type { Project, ProjectStatus } from '@/types'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  if (diffHour < 24) return `${diffHour} giờ trước`
  if (diffDay < 7) return `${diffDay} ngày trước`
  return d.toLocaleDateString('vi-VN')
}

function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'draft': return 'var(--text-muted)'
    case 'questions': return 'var(--warning)'
    case 'outline': return 'var(--accent-light)'
    case 'writing': return 'var(--accent)'
    case 'done': return 'var(--success)'
  }
}

function progressPercent(status: ProjectStatus): number {
  switch (status) {
    case 'draft': return 10
    case 'questions': return 30
    case 'outline': return 50
    case 'writing': return 75
    case 'done': return 100
  }
}

export function Dashboard(): JSX.Element {
  const { projects, openProject, deleteProject, setCreateDialogOpen, setSettingsOpen } = useAppStore()

  const sorted = [...projects].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Dự án của bạn</h1>
          <p className="dashboard__subtitle">{projects.length} dự án</p>
        </div>
        <div className="btn-group">
          <button className="btn btn--ghost btn--sm" onClick={() => setSettingsOpen(true)}>
            ⚙ Cài đặt
          </button>
          <button className="btn btn--primary" onClick={() => setCreateDialogOpen(true)}>
            + Tạo dự án mới
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="dashboard__empty">
          <div className="dashboard__empty-icon">📚</div>
          <h2 className="dashboard__empty-title">Chưa có dự án nào</h2>
          <p className="dashboard__empty-text">Bắt đầu bằng cách tạo dự án mới để viết câu chuyện đầu tiên</p>
          <button className="btn btn--primary" onClick={() => setCreateDialogOpen(true)}>
            + Tạo dự án mới
          </button>
        </div>
      ) : (
        <div className="dashboard__grid">
          {sorted.map((project: Project) => (
            <div
              key={project.id}
              className="dashboard-card"
              onClick={() => openProject(project.id)}
            >
              <div className="dashboard-card__header">
                <span
                  className="dashboard-card__status"
                  style={{ color: statusColor(project.status) }}
                >
                  {STATUS_LABELS[project.status]}
                </span>
                <button
                  className="dashboard-card__delete"
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id) }}
                  title="Xóa dự án"
                >
                  ✕
                </button>
              </div>

              <h3 className="dashboard-card__title">{project.name}</h3>

              {project.idea && (
                <p className="dashboard-card__idea">
                  {project.idea.length > 80 ? project.idea.slice(0, 80) + '...' : project.idea}
                </p>
              )}

              <div className="dashboard-card__meta">
                <span>{STYLE_LABELS[project.style]?.vi || project.style}</span>
                <span>{LANGUAGE_LABELS[project.language]}</span>
                <span>{project.duration} phút</span>
              </div>

              <div className="dashboard-card__progress">
                <div
                  className="dashboard-card__progress-bar"
                  style={{
                    width: `${progressPercent(project.status)}%`,
                    background: statusColor(project.status)
                  }}
                />
              </div>

              <div className="dashboard-card__footer">
                <span>{formatDate(project.updatedAt)}</span>
                {project.generatedStory && (
                  <span>
                    {(() => {
                      const { value, unit } = countText(project.generatedStory, project.language)
                      return `${value.toLocaleString()} ${unit}`
                    })()}
                  </span>
                )}
              </div>

              {project.writingMemory && (
                <div className="dashboard-card__resume">
                  <span className="dashboard-card__resume-icon">⚡</span>
                  <span>Viết dở — {project.writingMemory.completedChapters}/{project.writingMemory.totalChapters} chương</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
