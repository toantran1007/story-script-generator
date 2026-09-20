import { useEffect, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { countText } from '@/services/textMetrics'
import { STYLE_LABELS, LANGUAGE_LABELS } from '@/types'
import type { Project } from '@/types'
import { projectActivity } from '@/services/projectActivity'
import { estimateWrittenDuration, roundedMinutes } from '@shared/narrationDuration'

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

export function Dashboard(): JSX.Element {
  const { projects, runtimes, openProject, deleteProject, setCreateDialogOpen, setSettingsOpen, dataRoot, loadStorageInfo } = useAppStore()
  useEffect(() => { void loadStorageInfo() }, [loadStorageInfo])

  const sorted = [...projects].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Dự án của bạn</h1>
          <p className="dashboard__subtitle">{projects.length} dự án · Tự lưu tự động</p>
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

      <div className="form-group">
        <div className="form-hint">Dữ liệu trên máy: {dataRoot || 'Đang đọc thư mục dữ liệu...'}</div>
        <div className="btn-group">
          <button className="btn btn--secondary btn--sm" disabled={!dataRoot} onClick={() => void window.api.openDataRoot()}>Mở thư mục dữ liệu</button>
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
          {sorted.map((project: Project) => {
            const activity = projectActivity(project, runtimes?.[project.id])
            const timing = estimateWrittenDuration(project)
            return (
            <div
              key={project.id}
              className="dashboard-card"
              onClick={() => openProject(project.id)}
            >
              <div className="dashboard-card__header">
                <span
                  className="dashboard-card__status"
                  style={{ color: activity.color }}
                >
                  {activity.label}
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
                <span>Yêu cầu: {project.duration} phút</span>
                {timing.minutes !== null && <span>Ước tính từ bản đã viết: ~{roundedMinutes(timing.minutes)} phút</span>}
                {timing.source === 'ai-plan-ratio' && <span>Theo tỷ lệ kế hoạch AI · chưa đo TTS</span>}
              </div>

              <div className="dashboard-card__progress">
                <div
                  className="dashboard-card__progress-bar"
                  style={{
                    width: `${activity.percent}%`,
                    background: activity.color
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

              <div className="dashboard-card__resume" style={{ color: activity.color }}>
                <span>{activity.detail}{project.writingMemory ? ` · ${project.writingMemory.completedChapters}/${project.writingMemory.totalChapters} chương hoàn tất` : ''}</span>
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
