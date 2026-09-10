import { createEmptyProject, STYLE_LABELS, LANGUAGE_LABELS, type Project } from '@/types'
import { normalizeDuration } from '@/services/textMetrics'

export const WRITING_PREFERENCE_KEYS = [
  'ideaInputType', 'transformationLevel', 'style', 'customStyle', 'language', 'customLanguage',
  'duration', 'enableHook', 'readingSpeed', 'mode', 'autoFlow'
] as const
export type WritingPreferences = Pick<Project, typeof WRITING_PREFERENCE_KEYS[number]>
export interface WorkspaceSession {
  openTabs: string[]
  activeProjectId: string | null
  currentView: 'dashboard' | 'project'
  writingPreferences: WritingPreferences
}

export function writingPreferences(source?: Partial<Project> | null): WritingPreferences {
  const base = createEmptyProject('', '')
  const value = source || {}
  return {
    ideaInputType: value.ideaInputType === 'outline' ? 'outline' : 'idea',
    transformationLevel: ['develop', 'original', 'reborn'].includes(value.transformationLevel || '') ? value.transformationLevel! : base.transformationLevel,
    style: value.style && Object.hasOwn(STYLE_LABELS, value.style) ? value.style : base.style,
    customStyle: typeof value.customStyle === 'string' ? value.customStyle : '',
    language: value.language && Object.hasOwn(LANGUAGE_LABELS, value.language) ? value.language : base.language,
    customLanguage: typeof value.customLanguage === 'string' ? value.customLanguage : '',
    duration: normalizeDuration(value.duration ?? base.duration),
    enableHook: typeof value.enableHook === 'boolean' ? value.enableHook : base.enableHook,
    readingSpeed: typeof value.readingSpeed === 'number' && Number.isFinite(value.readingSpeed) ? Math.max(0, value.readingSpeed) : 0,
    mode: value.mode === 'guided' ? 'guided' : 'auto',
    autoFlow: typeof value.autoFlow === 'boolean' ? value.autoFlow : base.autoFlow
  }
}

export function restoreWorkspace(raw: unknown, projects: Project[]): WorkspaceSession {
  const latest = [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const meaningful = latest.find((p) => p.idea?.trim() || p.generatedStory?.trim()) || latest[0]
  const saved = raw && typeof raw === 'object' ? raw as Partial<WorkspaceSession> : null
  const preferences = writingPreferences(saved?.writingPreferences || meaningful)
  if (Array.isArray(saved?.openTabs)) {
    const validIds = new Set(projects.map((p) => p.id))
    const tabs = [...new Set(saved.openTabs.filter((id) => typeof id === 'string' && validIds.has(id)))]
    const active = saved.activeProjectId && tabs.includes(saved.activeProjectId) ? saved.activeProjectId : tabs.at(-1) || null
    return { openTabs: tabs, activeProjectId: active, currentView: saved.currentView === 'project' && active ? 'project' : 'dashboard', writingPreferences: preferences }
  }
  const resumable = latest.find((p) => p.status !== 'done' && (p.idea?.trim() || p.generatedStory?.trim()))
  return { openTabs: resumable ? [resumable.id] : [], activeProjectId: resumable?.id || null,
    currentView: resumable ? 'project' : 'dashboard', writingPreferences: preferences }
}
