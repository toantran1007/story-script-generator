import type { JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { STATUS_LABELS } from '@/types'

export function TabBar(): JSX.Element {
  const { openTabs, activeProjectId, projects, switchTab, closeTab, goToDashboard } = useAppStore()

  if (openTabs.length === 0) return <div />

  return (
    <div className="tab-bar">
      <button
        className="tab-bar__home"
        onClick={goToDashboard}
        title="Dashboard"
      >
        🏠
      </button>
      <div className="tab-bar__tabs">
        {openTabs.map((id) => {
          const project = projects.find((p) => p.id === id)
          if (!project) return null
          const isActive = id === activeProjectId

          return (
            <div
              key={id}
              className={`tab ${isActive ? 'tab--active' : ''}`}
              onClick={() => switchTab(id)}
            >
              <span className="tab__status-dot" style={{
                background: project.status === 'done' ? 'var(--success)' :
                  project.status === 'writing' ? 'var(--accent)' : 'var(--text-muted)'
              }} />
              <span className="tab__name">{project.name}</span>
              <span className="tab__badge">{STATUS_LABELS[project.status]}</span>
              <button
                className="tab__close"
                onClick={(e) => { e.stopPropagation(); closeTab(id) }}
                title="Đóng tab"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
