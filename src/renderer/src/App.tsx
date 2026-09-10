import { useEffect, useState, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { countText, readingMinutes } from '@/services/textMetrics'
import { Dashboard } from '@/components/Dashboard'
import { TabBar } from '@/components/TabBar'
import { WizardStep1 } from '@/components/WizardStep1'
import { WizardStep2 } from '@/components/WizardStep2'
import { WizardStep3 } from '@/components/WizardStep3'
import { SettingsModal } from '@/components/SettingsModal'
import { CreateProjectDialog } from '@/components/CreateProjectDialog'
import type { AppInfo, UpdateState } from '@/types'
import './App.css'

function TitleBar(): JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar__controls">
        <button className="titlebar__btn titlebar__btn--close" onClick={() => window.api.close()} />
        <button className="titlebar__btn titlebar__btn--minimize" onClick={() => window.api.minimize()} />
        <button className="titlebar__btn titlebar__btn--maximize" onClick={() => window.api.maximize()} />
      </div>
      <span className="titlebar__title">Trình Tạo Kịch Bản Truyện</span>
      <div style={{ width: 56 }} />
    </div>
  )
}

function StatusBar(): JSX.Element {
  const { activeProjectId, projects, runtimes } = useAppStore()
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    let isMounted = true
    const removeUpdateListener = window.api.onUpdateStatus((state) => {
      if (isMounted) setUpdateState(state)
    })

    window.api.getAppInfo().then((info) => {
      if (isMounted) setAppInfo(info)
    })
    window.api.getUpdateState().then((state) => {
      if (isMounted) setUpdateState(state)
    })

    return () => {
      isMounted = false
      removeUpdateListener()
    }
  }, [])

  const project = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null
  const runtime = activeProjectId ? runtimes[activeProjectId] : null
  const isGenerating = runtime?.isGenerating || false
  const progress = runtime?.generationProgress || ''
  const storyText = project?.generatedStory || ''
  const lang = project?.language || 'vi'
  const { value: wordCount, unit } = countText(storyText, lang)
  const readMinutes = readingMinutes(storyText, lang, project?.readingSpeed)
  const isUpdateBusy = ['checking', 'available', 'downloading'].includes(updateState.status)

  const updateButtonLabel = (): string => {
    switch (updateState.status) {
      case 'checking': return 'Đang kiểm tra...'
      case 'available': return `Có bản ${updateState.version || 'mới'}`
      case 'downloading': return `Đang tải ${Math.round(updateState.progress || 0)}%`
      case 'downloaded': return `Cài v${updateState.version || ''}`
      case 'up-to-date': return 'Đã mới nhất'
      case 'unsupported': return appInfo?.isPortable ? 'Bản portable' : 'Không hỗ trợ'
      case 'error': return 'Thử lại cập nhật'
      default: return 'Kiểm tra cập nhật'
    }
  }

  const handleUpdate = (): void => {
    if (updateState.status === 'downloaded') {
      window.api.installUpdate()
      return
    }
    void window.api.checkForUpdates()
  }

  return (
    <div className="statusbar">
      <span className={`statusbar__dot ${isGenerating ? 'statusbar__dot--generating' : ''}`} />
      <span>{isGenerating ? progress || 'Đang tạo...' : 'Sẵn sàng'}</span>
      {project && <span>{project.name}</span>}
      {wordCount > 0 && (
        <>
          <span>{wordCount.toLocaleString()} {unit}</span>
          <span>~{readMinutes} phút đọc</span>
        </>
      )}
      <div className="statusbar__app-info">
        <span className="statusbar__version">Phiên bản {appInfo?.version || '...'}</span>
        <button
          className={`statusbar__update statusbar__update--${updateState.status}`}
          onClick={handleUpdate}
          disabled={isUpdateBusy || updateState.status === 'unsupported'}
          title={updateState.message || 'Kiểm tra bản cập nhật mới'}
        >
          {updateButtonLabel()}
        </button>
      </div>
    </div>
  )
}

function ProjectView(): JSX.Element {
  const { activeProjectId, projects } = useAppStore()
  const project = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null

  if (!project) return <div className="main__content"><div className="empty-state"><div className="empty-state__title">Chọn một dự án</div></div></div>

  return (
    <div className="main__content">
      {project.currentStep === 1 && <WizardStep1 />}
      {project.currentStep === 2 && <WizardStep2 />}
      {project.currentStep === 3 && <WizardStep3 />}
    </div>
  )
}

export default function App(): JSX.Element {
  const { currentView, loadProjects, loadSettings, loadCustomPresets, isSettingsOpen, isCreateDialogOpen, openTabs, saveError, saveNow } = useAppStore()

  useEffect(() => {
    loadProjects()
    loadSettings()
    loadCustomPresets()
  }, [loadProjects, loadSettings, loadCustomPresets])

  useEffect(() => {
    const flush = (event: BeforeUnloadEvent): void => {
      window.dispatchEvent(new Event('app:commit-inputs'))
      if (!useAppStore.getState().flushProjects()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  return (
    <div className="app">
      <TitleBar />
      {saveError && <div className="error-banner" role="alert">
        <span>{saveError}</span>
        <button className="btn btn--secondary" onClick={() => void saveNow()}>Thử lưu lại</button>
      </div>}
      {openTabs.length > 0 && <TabBar />}
      <div className="app__body">
        <div className="main">
          {currentView === 'dashboard' ? <Dashboard /> : <ProjectView />}
        </div>
      </div>
      <StatusBar />
      {isSettingsOpen && <SettingsModal />}
      {isCreateDialogOpen && <CreateProjectDialog />}
    </div>
  )
}
