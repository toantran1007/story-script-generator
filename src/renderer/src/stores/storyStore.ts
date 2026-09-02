import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  Project,
  StoryStyle,
  Language,
  AppSettings,
  ChatMessage,
  Outline,
  OutlinePhase,
  DuplicateResult,
  InspirationProfile,
  OriginalityReport,
  TransformationLevel
} from '@/types'
import { DEFAULT_SETTINGS, createEmptyProject, normalizeSettings, recoverStaleProject } from '@/types'
import {
  chat,
  chatStream,
  abortOwner,
  clearCancel,
  isCancelled,
  CancelledError
} from '@/services/apiService'
import {
  buildQuestionsPrompt,
  buildAutoAnswerPrompt,
  buildOutlinePrompt,
  buildChapterChunkPrompt,
  buildLanguageRepairPrompt,
  buildInspirationProfilePrompt,
  buildOriginalityAuditPrompt,
  normalizeOriginalityReport,
  getStrongerTransformationLevel,
  originalityCandidateRank
} from '@/services/promptEngine'
import { checkDuplicate } from '@/services/similarityCheck'
import { findForbiddenFingerprints } from '@/services/originalityCheck'
import { stripNarrationMarkup } from '@/services/textCleanup'
import { distributeCharBudget, targetCharsFor, hookCharsFor, normalizeDuration } from '@/services/textMetrics'
import { hasTargetLanguageLeak } from '@/services/languageGuard'

// ===== Helpers =====
function safeParseJSON<T>(text: string): T | null {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const candidates = [cleaned]
  const objectStart = cleaned.indexOf('{')
  const objectEnd = cleaned.lastIndexOf('}')
  const arrayStart = cleaned.indexOf('[')
  const arrayEnd = cleaned.lastIndexOf(']')
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1))
  }
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(cleaned.slice(arrayStart, arrayEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next JSON-shaped section when the provider adds surrounding text.
    }
  }
  return null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseInspirationProfile(text: string): InspirationProfile | null {
  const value = safeParseJSON<Partial<InspirationProfile>>(text)
  if (!value || typeof value.creativeBrief !== 'string' || !value.creativeBrief.trim()) return null
  const sourceTypes = ['short-idea', 'summary', 'outline', 'full-story'] as const
  return {
    sourceType: sourceTypes.includes(value.sourceType as typeof sourceTypes[number])
      ? value.sourceType as InspirationProfile['sourceType']
      : 'short-idea',
    essence: strings(value.essence),
    expansionOpportunities: strings(value.expansionOpportunities),
    requiredElements: strings(value.requiredElements),
    forbiddenNames: strings(value.forbiddenNames),
    forbiddenSettings: strings(value.forbiddenSettings),
    forbiddenObjects: strings(value.forbiddenObjects),
    forbiddenPlotBeats: strings(value.forbiddenPlotBeats),
    forbiddenTwists: strings(value.forbiddenTwists),
    creativeBrief: value.creativeBrief.trim()
  }
}

function parseOriginalityReport(text: string, attempt: number): OriginalityReport | null {
  const value = safeParseJSON<Partial<OriginalityReport>>(text)
  if (!value || typeof value.passed !== 'boolean' || typeof value.score !== 'number') return null
  return {
    passed: value.passed,
    score: value.score,
    attempt,
    changedAxes: strings(value.changedAxes),
    reusedFingerprints: strings(value.reusedFingerprints),
    similarPlotBeats: strings(value.similarPlotBeats),
    sameTwistOrEnding: value.sameTwistOrEnding === true,
    feedback: strings(value.feedback),
    hardViolations: strings(value.hardViolations),
    softSimilarities: strings(value.softSimilarities),
    plotSimilarity: typeof value.plotSimilarity === 'number' ? value.plotSimilarity : undefined
  }
}

function outlineLanguageText(outline: Outline): string {
  return [
    outline.title,
    outline.outlineSummary,
    ...outline.chapters.flatMap((chapter) => [chapter.title, chapter.summary])
  ].join('\n')
}

function ts(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ===== Log entry =====
export interface LogEntry {
  time: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  detail?: string
}

// ===== Runtime state per open tab (not persisted) =====
export interface WizardRuntime {
  isLoadingQuestions: boolean
  isGenerating: boolean
  isCancelling: boolean
  generationProgress: string
  streamingText: string
  duplicateResult: DuplicateResult | null
  error: string | null
  logs: LogEntry[]
  // Chunked writing state
  lastFailedChapter: number
  lastFailedChunk: number
  writtenChapters: number
  totalChapters: number
  lastAction: 'generateQuestions' | 'generateOutline' | 'confirmAndWrite' | null
}

function defaultRuntime(): WizardRuntime {
  return {
    isLoadingQuestions: false,
    isGenerating: false,
    isCancelling: false,
    generationProgress: '',
    streamingText: '',
    duplicateResult: null,
    error: null,
    logs: [],
    lastFailedChapter: -1,
    lastFailedChunk: -1,
    writtenChapters: 0,
    totalChapters: 0,
    lastAction: null
  }
}

// ===== Store =====
interface AppState {
  currentView: 'dashboard' | 'project'
  projects: Project[]
  openTabs: string[]
  activeProjectId: string | null
  runtimes: Record<string, WizardRuntime>
  settings: AppSettings
  isSettingsOpen: boolean
  isCreateDialogOpen: boolean

  // Custom presets
  savedStyles: string[]
  savedLanguages: string[]

  // Helpers
  getActiveProject: () => Project | null
  getActiveRuntime: () => WizardRuntime

  // Data loading
  loadProjects: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>

  // Project CRUD
  createProject: (name: string) => Promise<void>
  openProject: (id: string) => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  deleteProject: (id: string) => Promise<void>
  goToDashboard: () => void

  // Active project field setters
  setIdea: (v: string) => void
  setTransformationLevel: (v: TransformationLevel) => void
  setStoryNotes: (v: string) => void
  setAutoFlow: (v: boolean) => void
  setEnableHook: (v: boolean) => void
  setStyle: (v: StoryStyle) => void
  setCustomStyle: (v: string) => void
  setLanguage: (v: Language) => void
  setCustomLanguage: (v: string) => void
  setDuration: (v: number) => void
  setReadingSpeed: (v: number) => void
  setMode: (v: 'guided' | 'auto') => void
  setStep: (step: 1 | 2 | 3) => void
  setAnswer: (idx: number, answer: string) => void
  setUserDirection: (v: string) => void
  setOriginalScript: (v: string) => void
  setChosenDirection: (v: string) => void

  // Async generation
  generateQuestions: () => Promise<void>
  /** forPid: chuỗi auto truyền PID của dự án khởi chạy — không truyền thì lấy tab đang mở */
  generateOutline: (forPid?: string) => Promise<void>
  regenerateOutline: () => Promise<void>
  retryOutlineStronger: () => Promise<void>
  confirmAndWrite: (forPid?: string) => Promise<void>
  continueWriting: () => Promise<void>
  stopGeneration: () => void
  retryLastAction: () => Promise<void>
  exportProject: (id: string, format: string) => Promise<void>

  // Custom presets
  loadCustomPresets: () => Promise<void>
  saveCustomStylePreset: (v: string) => Promise<void>
  deleteCustomStylePreset: (v: string) => Promise<void>
  saveCustomLanguagePreset: (v: string) => Promise<void>
  deleteCustomLanguagePreset: (v: string) => Promise<void>

  // UI
  setSettingsOpen: (v: boolean) => void
  setCreateDialogOpen: (v: boolean) => void
  clearError: () => void
  clearLogs: () => void
  resetWizard: () => void
}

// ===== Auto-save debounce =====
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
const MAX_SOURCE_CHARS = 120_000
// Track which projects have unsaved in-memory changes
const dirtyProjects = new Set<string>()

function markDirty(pid: string): void {
  dirtyProjects.add(pid)
  scheduleAutoSave()
}

function scheduleAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    flushDirtyProjects()
  }, 800)
}

function flushDirtyProjects(): void {
  if (dirtyProjects.size === 0) return
  const { projects } = useAppStore.getState()
  for (const pid of dirtyProjects) {
    const project = projects.find((p) => p.id === pid)
    if (project) {
      window.api.saveProject({ ...project, updatedAt: new Date().toISOString() })
    }
  }
  dirtyProjects.clear()
}

// ===== CHUNK_SIZE for writing =====
const CHUNK_CHARS = 2000
// Khối kết cần đủ đất diễn để không cụt ngủn, kể cả khi hạn mức đã cạn
const CONCLUSION_MIN_CHARS = 1000
const ABSOLUTE_MIN_CHUNK_CHARS = 200

// ===== Create store =====
export const useAppStore = create<AppState>((set, get) => {
  // Internal helpers (closure-scoped, not in state)
  function updateProject(fields: Partial<Project>): void {
    const { activeProjectId, projects } = get()
    if (!activeProjectId) return
    const idx = projects.findIndex((p) => p.id === activeProjectId)
    if (idx < 0) return
    const updated = { ...projects[idx], ...fields, updatedAt: new Date().toISOString() }
    const next = [...projects]
    next[idx] = updated
    set({ projects: next })
    markDirty(activeProjectId)
  }

  function updateRuntime(fields: Partial<WizardRuntime>): void {
    const { activeProjectId, runtimes } = get()
    if (!activeProjectId) return
    set({
      runtimes: {
        ...runtimes,
        [activeProjectId]: { ...(runtimes[activeProjectId] || defaultRuntime()), ...fields }
      }
    })
  }

  function updateRuntimeFor(id: string, fields: Partial<WizardRuntime>): void {
    const { runtimes } = get()
    set({
      runtimes: {
        ...runtimes,
        [id]: { ...(runtimes[id] || defaultRuntime()), ...fields }
      }
    })
  }

  function updateProjectById(id: string, fields: Partial<Project>): void {
    const { projects } = get()
    const idx = projects.findIndex((p) => p.id === id)
    if (idx < 0) return
    const updated = { ...projects[idx], ...fields, updatedAt: new Date().toISOString() }
    const next = [...projects]
    next[idx] = updated
    set({ projects: next })
    markDirty(id)
  }

  function addLog(pid: string, level: LogEntry['level'], message: string, detail?: string): void {
    const { runtimes } = get()
    const rt = runtimes[pid] || defaultRuntime()
    const entry: LogEntry = { time: ts(), level, message, detail }
    updateRuntimeFor(pid, { logs: [...rt.logs, entry] })
  }

  function errorDetail(err: unknown): string {
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    const apiError = err as { technicalDetail?: string; attempts?: number }
    const sanitized = raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/(api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .replace(/\s+/g, ' ')
      .trim()
    const settings = get().settings
    const endpoint = settings.apiBaseUrl || '(chưa cấu hình)'
    const model = settings.model || '(mặc định nhà cung cấp)'
    const attempts = apiError.attempts ? ` · Số lần gọi: ${apiError.attempts}` : ''
    const technical = apiError.technicalDetail && apiError.technicalDetail !== sanitized
      ? apiError.technicalDetail
      : sanitized
    return `Nhà cung cấp: ${settings.apiProvider} · Model: ${model} · Endpoint: ${endpoint}${attempts} · Chi tiết: ${technical.slice(0, 700)}`
  }

  function getProjectById(id: string): Project | null {
    return get().projects.find((p) => p.id === id) || null
  }

  // Phân biệt "người dùng bấm Dừng" với "lỗi thật" khi xử lý catch
  function reportFailure(pid: string, err: unknown, prefix: string): void {
    if (err instanceof CancelledError || isCancelled(pid)) {
      addLog(pid, 'warn', 'Đã dừng theo yêu cầu của người dùng')
      updateRuntimeFor(pid, { error: null, generationProgress: 'Đã dừng' })
      return
    }
    const detail = errorDetail(err)
    addLog(pid, 'error', prefix, detail)
    updateRuntimeFor(pid, { error: `${prefix}: ${err instanceof Error ? err.message : String(err)}` })
  }

  // Chuẩn bị chạy một tác vụ mới cho dự án: xoá cờ huỷ còn sót lại từ lần trước
  function beginTask(pid: string): void {
    clearCancel(pid)
    updateRuntimeFor(pid, { isCancelling: false })
  }

  // ===== Chunked chapter writer =====
  async function writeChapterChunked(args: {
    pid: string
    outline: Outline
    chapterIndex: number
    style: StoryStyle
    language: Language
    previousSummary: string | null
    /** Hạn mức ký tự của chương này, suy ra từ thời lượng + ngôn ngữ */
    targetChars: number
    /** Số ký tự đã viết cho chương này ở lần chạy trước (khi viết tiếp) */
    alreadyWrittenChars?: number
    /** Cỡ cửa sổ hook 2 phút đầu (ký tự) — chỉ có tác dụng với chương 1 */
    hookChars?: number
    enableHook?: boolean
    customStyle?: string
    customLanguage?: string
    startChunkIndex?: number
    userDirection?: string
    storyNotes?: string
  }): Promise<{ text: string; lastSummary: string; charsWritten: number }> {
    const {
      pid, outline, chapterIndex, style, language, previousSummary,
      targetChars, customStyle, customLanguage, userDirection, storyNotes, enableHook
    } = args
    const startChunkIndex = args.startChunkIndex ?? 0
    const plannedChunks = Math.max(1, Math.ceil(targetChars / CHUNK_CHARS))
    let chapterText = ''
    let memory = previousSummary || ''
    // Ký tự đã viết cho chương này, gồm cả phần của lần chạy trước
    let written = args.alreadyWrittenChars ?? 0

    if (startChunkIndex > 0) {
      addLog(pid, 'info', `Tiếp tục chương ${chapterIndex + 1} từ khối ${startChunkIndex + 1} (đã có ${written.toLocaleString()}/${targetChars.toLocaleString()} ký tự)`)
    }

    let chunk = startChunkIndex
    // Chương đã có khối kết chưa — vòng lặp chỉ dừng sau khi khối kết được viết,
    // để truyện không bao giờ đứt ngang giữa cảnh vì hạn mức cạn sớm
    let concluded = false
    // Chặn trên để không bao giờ chạy vô hạn nếu model liên tục trả về quá ít
    const maxChunk = startChunkIndex + plannedChunks + 4

    while (chunk < maxChunk && !concluded) {
      if (isCancelled(pid)) throw new CancelledError()

      const remainingChars = targetChars - written
      // Khối kết: khi phần còn lại nằm gọn trong một khối — kể cả khi model đã
      // viết vượt và hạn mức thực tế đã cạn. Hạn mức là MỤC TIÊU độ dài,
      // không phải lưỡi dao cắt ngang mạch truyện: chương nào cũng phải được kết.
      const isLastChunk = remainingChars <= CHUNK_CHARS || chunk === maxChunk - 1
      const conclusionFloor = Math.min(
        CONCLUSION_MIN_CHARS,
        Math.max(ABSOLUTE_MIN_CHUNK_CHARS, targetChars)
      )
      const chunkTarget = isLastChunk
        ? Math.min(CHUNK_CHARS, Math.max(conclusionFloor, remainingChars))
        : CHUNK_CHARS
      const displayTotal = Math.max(plannedChunks, chunk + 1)
      // Khối này còn nằm trong cửa sổ hook 2 phút đầu không (chỉ chương 1;
      // `written` gồm cả phần đã viết trước khi dừng nên viết tiếp không lặp lại hook)
      const hookWindowChars =
        chapterIndex === 0 && args.hookChars ? Math.max(0, args.hookChars - written) : 0

      updateRuntimeFor(pid, {
        generationProgress: `Chương ${chapterIndex + 1}/${outline.chapters.length} · Khối ${chunk + 1}/${displayTotal}`,
        lastFailedChapter: chapterIndex,
        lastFailedChunk: chunk
      })
      addLog(pid, 'info', (isLastChunk
        ? `Viết KHỐI KẾT chương ${chapterIndex + 1} (~${chunkTarget} ký tự)`
        : `Viết chương ${chapterIndex + 1}, khối ${chunk + 1}/${displayTotal} (~${chunkTarget} ký tự, còn ${Math.max(0, remainingChars).toLocaleString()})`)
        + (hookWindowChars > 0 ? ' — kèm HOOK giữ chân 2 phút đầu' : ''))

      const { system, user } = buildChapterChunkPrompt(outline, chapterIndex, style, language, {
        chunkIndex: chunk,
        totalChunks: displayTotal,
        targetChars: chunkTarget,
        isLastChunk,
        enableHook,
        hookWindowChars,
        previousContext: memory || null,
        userDirection,
        storyNotes,
        customStyle,
        customLanguage
      })

      try {
        const streamPrefix = (get().runtimes[pid] || defaultRuntime()).streamingText
        const rawChunk = await chatStream(
          [{ role: 'system', content: system }, { role: 'user', content: user }],
          (token) => {
            const { runtimes } = get()
            const rt = runtimes[pid] || defaultRuntime()
            set({
              runtimes: { ...get().runtimes, [pid]: { ...rt, streamingText: rt.streamingText + token } }
            })
          },
          undefined,
          pid
        )

        // Bỏ tiêu đề / nhãn chương / ký hiệu markdown để văn bản đọc được ngay
        let cleanChunk = stripNarrationMarkup(rawChunk)
        if (hasTargetLanguageLeak(cleanChunk, language, customLanguage)) {
          addLog(pid, 'warn', `Phát hiện khối ${chunk + 1} bị lẫn ngôn ngữ — đang tự sửa`)
          updateRuntimeFor(pid, { generationProgress: `Đang sửa ngôn ngữ khối ${chunk + 1}...` })
          const repair = buildLanguageRepairPrompt(cleanChunk, language, customLanguage)
          const repaired = stripNarrationMarkup(await chat(
            [{ role: 'system', content: repair.system }, { role: 'user', content: repair.user }],
            undefined,
            pid
          ))
          if (hasTargetLanguageLeak(repaired, language, customLanguage)) {
            throw new Error(`Khối ${chunk + 1} vẫn bị lẫn ngôn ngữ sau khi tự sửa`)
          }
          cleanChunk = repaired
          updateRuntimeFor(pid, { streamingText: streamPrefix + cleanChunk })
          addLog(pid, 'success', `Đã sửa ngôn ngữ khối ${chunk + 1}`)
        }

        // Khối mới thường bắt đầu ngay bằng chữ; nếu không có khoảng trắng ở chỗ nối
        // thì câu cuối khối trước sẽ dính liền câu đầu khối sau. Khi viết tiếp sau khi
        // dừng, chapterText rỗng nên phải so với phần truyện đã lưu.
        const prevTail = chapterText || getProjectById(pid)?.generatedStory || ''
        const needsBreak = prevTail.trim() !== '' && /\S$/.test(prevTail) && /^\S/.test(cleanChunk)
        const chunkText = (needsBreak ? '\n\n' : '') + cleanChunk

        chapterText += chunkText
        memory = chapterText.slice(-500)
        written += cleanChunk.length

        // Update project with partial progress + ghi nhớ vị trí khối,
        // để dừng/khôi phục giữa chương không viết lại đoạn đã có
        const proj = getProjectById(pid)
        if (proj) {
          updateProjectById(pid, {
            generatedStory: proj.generatedStory + chunkText,
            writingMemory: proj.writingMemory
              ? {
                  ...proj.writingMemory,
                  currentChapter: chapterIndex,
                  currentChunk: chunk + 1,
                  chapterCharsWritten: written,
                  lastContext: memory,
                  lastWriteAt: new Date().toISOString()
                }
              : proj.writingMemory
          })
        }

        addLog(
          pid,
          'success',
          `Khối ${chunk + 1} hoàn thành (${cleanChunk.length} ký tự — chương: ${written.toLocaleString()}/${targetChars.toLocaleString()})`,
          `Chương ${chapterIndex + 1} · Còn khoảng ${Math.max(0, targetChars - written).toLocaleString()} ký tự`
        )
      } catch (err) {
        if (!(err instanceof CancelledError)) {
          addLog(pid, 'error', `Lỗi khối ${chunk + 1}`, errorDetail(err))
        }
        updateRuntimeFor(pid, { lastFailedChapter: chapterIndex, lastFailedChunk: chunk })
        throw err
      }

      if (isLastChunk) concluded = true
      chunk++
    }

    return { text: chapterText, lastSummary: chapterText.slice(-500), charsWritten: written }
  }

  return {
    currentView: 'dashboard',
    projects: [],
    openTabs: [],
    activeProjectId: null,
    runtimes: {},
    settings: { ...DEFAULT_SETTINGS },
    isSettingsOpen: false,
    isCreateDialogOpen: false,
    savedStyles: [],
    savedLanguages: [],

    // Helpers
    getActiveProject: () => {
      const { activeProjectId, projects } = get()
      return activeProjectId ? projects.find((p) => p.id === activeProjectId) || null : null
    },
    getActiveRuntime: () => {
      const { activeProjectId, runtimes } = get()
      return activeProjectId ? runtimes[activeProjectId] || defaultRuntime() : defaultRuntime()
    },

    // === Data loading ===
    loadProjects: async () => {
      const storedProjects = (await window.api.getProjects()) as Project[]
      const projects = storedProjects.map((project) => {
        const wasRewrite = project.projectType === 'rewrite'
        const migrateToInput = wasRewrite && project.currentStep < 3
        const migratedIdea = project.idea?.trim() ? project.idea : project.originalScript || ''
        return recoverStaleProject({
          ...project,
          projectType: 'new' as const,
          idea: migratedIdea,
          transformationLevel: project.transformationLevel || 'original' as const,
          inspirationProfile: project.inspirationProfile || null,
          originalityReport: project.originalityReport || null,
          currentStep: migrateToInput ? 1 : project.currentStep,
          status: migrateToInput ? 'draft' as const : project.status,
          duration: normalizeDuration(project.duration),
          enableHook: project.enableHook !== false
        })
      })
      const recovered = projects.filter((project, index) => {
        const original = storedProjects[index]
        return project.currentStep !== original.currentStep ||
          project.status !== original.status ||
          project.outlinePhase !== original.outlinePhase
      })
      if (recovered.length > 0) {
        await Promise.all(recovered.map((project) => window.api.saveProject(project)))
      }
      set({ projects })
    },
    loadSettings: async () => {
      const rawSettings = (await window.api.getSettings()) as Partial<AppSettings>
      const settings = normalizeSettings(rawSettings)
      await window.api.saveSettings(settings)
      set({ settings })
    },
    saveSettings: async (settings) => {
      const normalized = normalizeSettings(settings)
      await window.api.saveSettings(normalized)
      set({ settings: normalized })
    },

    // === Project CRUD ===
    createProject: async (name) => {
      const id = uuidv4()
      const project = createEmptyProject(id, name, 'new')

      // CRITICAL: Flush ALL dirty in-memory projects to disk BEFORE creating new one
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
      flushDirtyProjects()

      // Save the new project to disk
      await window.api.saveProject(project)

      // Add to in-memory array (don't replace with disk response)
      set((s) => ({
        projects: [project, ...s.projects],
        openTabs: [...s.openTabs.filter((t) => t !== id), id],
        activeProjectId: id,
        currentView: 'project',
        runtimes: { ...s.runtimes, [id]: defaultRuntime() },
        isCreateDialogOpen: false
      }))
    },

    openProject: (id) => {
      set((s) => ({
        openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
        activeProjectId: id,
        currentView: 'project',
        runtimes: s.runtimes[id] ? s.runtimes : { ...s.runtimes, [id]: defaultRuntime() }
      }))
    },

    closeTab: (id) => {
      const project = get().projects.find((p) => p.id === id)
      if (project) {
        window.api.saveProject({ ...project, updatedAt: new Date().toISOString() })
      }
      set((s) => {
        const tabs = s.openTabs.filter((t) => t !== id)
        const newRuntimes = { ...s.runtimes }
        delete newRuntimes[id]
        let newActive = s.activeProjectId
        let newView = s.currentView
        if (s.activeProjectId === id) {
          newActive = tabs.length > 0 ? tabs[tabs.length - 1] : null
          newView = tabs.length > 0 ? 'project' : 'dashboard'
        }
        return { openTabs: tabs, activeProjectId: newActive, currentView: newView, runtimes: newRuntimes }
      })
    },

    switchTab: (id) => set({ activeProjectId: id, currentView: 'project' }),

    deleteProject: async (id) => {
      // Flush dirty projects (excluding the one being deleted)
      dirtyProjects.delete(id)
      flushDirtyProjects()
      await window.api.deleteProject(id)

      set((s) => {
        const tabs = s.openTabs.filter((t) => t !== id)
        const newRuntimes = { ...s.runtimes }
        delete newRuntimes[id]
        let newActive = s.activeProjectId
        let newView = s.currentView
        if (s.activeProjectId === id) {
          newActive = tabs.length > 0 ? tabs[tabs.length - 1] : null
          newView = tabs.length > 0 ? 'project' : 'dashboard'
        }
        return {
          projects: s.projects.filter((p) => p.id !== id),
          openTabs: tabs, activeProjectId: newActive, currentView: newView, runtimes: newRuntimes
        }
      })
    },

    goToDashboard: () => set({ currentView: 'dashboard' }),

    // === Field setters ===
    setIdea: (v) => updateProject({
      idea: v,
      inspirationProfile: null,
      originalityReport: null
    }),
    setTransformationLevel: (v) => updateProject({
      transformationLevel: v,
      originalityReport: null
    }),
    setStoryNotes: (v) => updateProject({ storyNotes: v }),
    setAutoFlow: (v) => updateProject({ autoFlow: v }),
    setEnableHook: (v) => updateProject({ enableHook: v }),
    setStyle: (v) => updateProject({ style: v }),
    setCustomStyle: (v) => updateProject({ customStyle: v }),
    setLanguage: (v) => updateProject({ language: v }),
    setCustomLanguage: (v) => updateProject({ customLanguage: v }),
    setDuration: (v) => updateProject({ duration: normalizeDuration(v) }),
    setReadingSpeed: (v) => updateProject({ readingSpeed: Math.max(0, Math.round(v) || 0) }),
    setMode: (v) => updateProject({ mode: v }),
    setStep: (step) => updateProject({ currentStep: step as 1 | 2 | 3 }),
    setAnswer: (idx, answer) => {
      const p = get().getActiveProject()
      if (!p) return
      updateProject({ answers: { ...p.answers, [idx]: answer } })
    },
    setUserDirection: (v) => updateProject({ userDirection: v }),
    setOriginalScript: (v) => updateProject({ originalScript: v }),
    setChosenDirection: (v) => updateProject({ chosenDirection: v }),
    setSettingsOpen: (v) => set({ isSettingsOpen: v }),
    setCreateDialogOpen: (v) => set({ isCreateDialogOpen: v }),
    clearError: () => updateRuntime({ error: null }),
    clearLogs: () => updateRuntime({ logs: [] }),

    // === Custom presets ===
    loadCustomPresets: async () => {
      const data = (await window.api.getCustomPresets()) as { styles: string[]; languages: string[] }
      set({ savedStyles: data.styles || [], savedLanguages: data.languages || [] })
    },
    saveCustomStylePreset: async (v) => {
      if (!v.trim()) return
      const styles = (await window.api.saveCustomStyle(v.trim())) as string[]
      set({ savedStyles: styles })
    },
    deleteCustomStylePreset: async (v) => {
      const styles = (await window.api.deleteCustomStyle(v)) as string[]
      set({ savedStyles: styles })
    },
    saveCustomLanguagePreset: async (v) => {
      if (!v.trim()) return
      const languages = (await window.api.saveCustomLanguage(v.trim())) as string[]
      set({ savedLanguages: languages })
    },
    deleteCustomLanguagePreset: async (v) => {
      const languages = (await window.api.deleteCustomLanguage(v)) as string[]
      set({ savedLanguages: languages })
    },

    resetWizard: () => {
      const pid = get().activeProjectId
      if (!pid) return
      const p = getProjectById(pid)
      updateProjectById(pid, {
        currentStep: 1, idea: '', transformationLevel: 'original',
        inspirationProfile: null, originalityReport: null,
        storyNotes: '', style: 'dramatic', customStyle: '',
        language: 'vi', customLanguage: '', duration: 30, enableHook: true, readingSpeed: 0, mode: 'guided', autoFlow: false,
        originalScript: '', scriptAnalysis: '', suggestedDirections: [], chosenDirection: '',
        questions: [], answers: {}, outlinePhase: 'idle', outline: null,
        viSummary: '', userDirection: '', generatedStory: '', outlineSummary: '',
        status: 'draft', projectType: 'new'
      })
      updateRuntimeFor(pid, defaultRuntime())
    },

    generateQuestions: async () => {
      const pid = get().activeProjectId
      if (!pid) return
      const p = getProjectById(pid)
      if (!p) return

      if (p.idea.length > MAX_SOURCE_CHARS) {
        updateRuntimeFor(pid, {
          error: `Nội dung quá dài (${p.idea.length.toLocaleString()} ký tự). Vui lòng rút gọn còn tối đa ${MAX_SOURCE_CHARS.toLocaleString()} ký tự.`,
          lastAction: null
        })
        return
      }

      beginTask(pid)
      updateRuntimeFor(pid, { isLoadingQuestions: true, error: null, lastAction: 'generateQuestions', logs: [], generationProgress: 'Đang tạo câu hỏi...' })
      updateProjectById(pid, { questions: [], answers: {} })
      addLog(
        pid,
        'info',
        'Bắt đầu tạo câu hỏi...',
        `Nguồn: ${p.idea.length.toLocaleString()} ký tự · Provider: ${get().settings.apiProvider} · Model: ${get().settings.model || '(mặc định)'}`
      )

      try {
        let inspirationProfile = p.inspirationProfile
        if (!inspirationProfile) {
          updateRuntimeFor(pid, { generationProgress: 'Đang chắt lọc điểm đặc sắc từ nguồn...' })
          addLog(pid, 'info', 'Phân tích nguồn tham khảo thành hồ sơ cảm hứng trừu tượng...')
          const profilePrompt = buildInspirationProfilePrompt(p.idea, p.storyNotes)
          const profileResp = await chat(
            [
              { role: 'system', content: profilePrompt.system },
              { role: 'user', content: profilePrompt.user }
            ],
            { temperature: 0.2 },
            pid
          )
          inspirationProfile = parseInspirationProfile(profileResp)
          if (!inspirationProfile) throw new Error('Không thể tạo hồ sơ cảm hứng từ nội dung nguồn')
          updateProjectById(pid, { inspirationProfile })
          addLog(
            pid,
            'success',
            `Đã chắt lọc ${inspirationProfile.essence.length} điểm đặc sắc và ${inspirationProfile.forbiddenNames.length} tên bị cấm`,
            `Loại nguồn: ${inspirationProfile.sourceType} · Bối cảnh cấm: ${inspirationProfile.forbiddenSettings.length} · Đồ vật cấm: ${inspirationProfile.forbiddenObjects.length} · Tình huống cấm: ${inspirationProfile.forbiddenPlotBeats.length}`
          )
        }

        updateRuntimeFor(pid, { generationProgress: 'Đang tạo câu hỏi cho câu chuyện mới...' })
        const { system, user } = buildQuestionsPrompt(
          p.idea, p.style, p.language, p.duration, p.customStyle, p.customLanguage, p.storyNotes, inspirationProfile
        )
        const response = await chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          undefined,
          pid
        )
        const parsed = safeParseJSON<string[]>(response)
        if (!parsed || !Array.isArray(parsed)) throw new Error('Không thể phân tích câu hỏi')

        updateProjectById(pid, { questions: parsed, currentStep: 2, status: 'questions' })
        addLog(pid, 'success', `Tạo ${parsed.length} câu hỏi thành công`, `Chế độ: ${p.mode} · Ngôn ngữ đầu ra: ${p.language}`)

        if (p.mode === 'auto') {
          updateRuntimeFor(pid, { generationProgress: 'AI đang trả lời câu hỏi...' })
          addLog(pid, 'info', 'Chế độ tự động — AI đang trả lời câu hỏi...')
          const { system: aS, user: aU } = buildAutoAnswerPrompt(
            p.idea, parsed, p.style, p.language, p.customStyle, p.customLanguage, p.storyNotes, inspirationProfile
          )
          const aResp = await chat(
            [{ role: 'system', content: aS }, { role: 'user', content: aU }],
            undefined,
            pid
          )
          const autoAnswers = safeParseJSON<string[]>(aResp)
          if (autoAnswers && Array.isArray(autoAnswers)) {
            const answersMap: Record<number, string> = {}
            autoAnswers.forEach((a, i) => { answersMap[i] = a })
            updateProjectById(pid, { answers: answersMap })
            addLog(pid, 'success', 'AI trả lời xong — chuyển sang tạo dàn ý')
            if (isCancelled(pid)) throw new CancelledError()
            updateRuntimeFor(pid, { generationProgress: 'Đang chuyển sang tạo dàn ý...' })
            // Don't clear isLoadingQuestions — generateOutline will take over with isGenerating
            updateRuntimeFor(pid, { isLoadingQuestions: false })
            // Truyền pid đã bắt đầu chuỗi — người dùng có thể đã chuyển sang tab khác
            await get().generateOutline(pid)
            return // Skip the finally block's isLoadingQuestions clear
          } else {
            // Auto-answer failed to parse — fall through to manual mode
            addLog(pid, 'warn', 'AI trả lời không hợp lệ — chuyển sang chế độ thủ công')
          }
        }
      } catch (err) {
        reportFailure(pid, err, 'Tạo câu hỏi thất bại')
      } finally {
        clearCancel(pid)
        updateRuntimeFor(pid, { isLoadingQuestions: false, isCancelling: false, generationProgress: '' })
      }
    },

    generateOutline: async (forPid?: string) => {
      // Chuỗi auto truyền thẳng PID; typeof-check để lỡ có nơi truyền event cũng không hỏng
      const pid = typeof forPid === 'string' ? forPid : get().activeProjectId
      if (!pid) return
      const p = getProjectById(pid)
      if (!p) return

      beginTask(pid)
      updateRuntimeFor(pid, { isGenerating: true, error: null, duplicateResult: null, generationProgress: 'Đang tạo dàn ý cốt truyện...', lastAction: 'generateOutline' })
      updateProjectById(pid, { outline: null, viSummary: '', userDirection: '', outlinePhase: 'generating-outline', currentStep: 3, status: 'outline' })
      addLog(pid, 'info', 'Bắt đầu tạo dàn ý...')

      // true khi autoFlow đã chuyển tiếp sang confirmAndWrite — finally không được
      // ghi đè trạng thái mà confirmAndWrite đã đặt (VD: generationProgress 'Hoàn thành!')
      let chainedToWrite = false
      try {
        const qaList = p.questions.map((q, i) => ({
          question: q,
          answer: p.answers[i] || '(AI sẽ tự quyết định)'
        }))
        const existingOutlines = get().projects
          .filter((x) => x.id !== pid && x.outlineSummary)
          .map((x) => x.outlineSummary)

        const profile = p.inspirationProfile
        if (!profile) throw new Error('Chưa có hồ sơ cảm hứng. Vui lòng quay lại bước 1 và tạo lại.')

        let outline: Outline | null = null
        let originalityReport: OriginalityReport | null = null
        let bestOutline: Outline | null = null
        let bestReport: OriginalityReport | null = null
        let originalityFeedback: string[] = []
        const transformationLevel = p.transformationLevel || 'original'

        for (let attempt = 1; attempt <= 3; attempt++) {
          updateRuntimeFor(pid, {
            generationProgress: `Đang tạo cấu trúc mới và kiểm tra độ độc lập — lần ${attempt}/3...`
          })
          addLog(
            pid,
            'info',
            `Tạo dàn ý độc lập lần ${attempt}/3`,
            `Mức biến đổi: ${transformationLevel} · Q&A: ${qaList.length} · Dàn ý cũ dùng để tránh trùng: ${existingOutlines.length}`
          )

          const outlinePrompt = buildOutlinePrompt(
            p.idea, p.style, p.language, p.duration, qaList, existingOutlines,
            p.customStyle, p.customLanguage, p.storyNotes, p.enableHook !== false,
            profile, transformationLevel, originalityFeedback
          )
          const outlineResp = await chat(
            [{ role: 'system', content: outlinePrompt.system }, { role: 'user', content: outlinePrompt.user }],
            { temperature: 0.4 },
            pid
          )

          let candidate = safeParseJSON<Outline>(outlineResp)
          if (!candidate || !candidate.chapters || !candidate.title) throw new Error('Không thể phân tích outline')

          if (hasTargetLanguageLeak(outlineLanguageText(candidate), p.language, p.customLanguage)) {
            addLog(pid, 'warn', 'Phát hiện dàn ý bị lẫn ngôn ngữ — đang tự sửa trước khi kiểm tra')
            updateRuntimeFor(pid, { generationProgress: 'Đang sửa ngôn ngữ dàn ý...' })
            const repair = buildLanguageRepairPrompt(JSON.stringify(candidate), p.language, p.customLanguage, 'outline-json')
            const repairedResp = await chat(
              [{ role: 'system', content: repair.system }, { role: 'user', content: repair.user }],
              { temperature: 0.2 },
              pid
            )
            const repairedOutline = safeParseJSON<Outline>(repairedResp)
            if (!repairedOutline || !repairedOutline.chapters || !repairedOutline.title) {
              throw new Error('Không thể phân tích dàn ý sau khi sửa ngôn ngữ')
            }
            if (hasTargetLanguageLeak(outlineLanguageText(repairedOutline), p.language, p.customLanguage)) {
              throw new Error('Dàn ý vẫn bị lẫn ngôn ngữ sau khi tự sửa')
            }
            candidate = repairedOutline
            addLog(pid, 'success', 'Đã sửa ngôn ngữ dàn ý')
          }

          const auditPrompt = buildOriginalityAuditPrompt(candidate, profile, transformationLevel, attempt)
          const auditResp = await chat(
            [{ role: 'system', content: auditPrompt.system }, { role: 'user', content: auditPrompt.user }],
            { temperature: 0.1 },
            pid
          )
          const audit = parseOriginalityReport(auditResp, attempt)
          if (!audit) throw new Error('Bộ kiểm tra độ độc lập trả về dữ liệu không hợp lệ')
          const report = normalizeOriginalityReport(audit, transformationLevel, findForbiddenFingerprints(candidate, profile))
          updateProjectById(pid, { originalityReport: report })
          if (!bestReport || originalityCandidateRank(report) > originalityCandidateRank(bestReport)) {
            bestReport = report
            bestOutline = candidate
          }
          if (report.passed) {
            outline = candidate
            originalityReport = report
            addLog(
              pid,
              'success',
              `Dàn ý đạt kiểm định độc lập (${report.score}/100, ${report.changedAxes.length}/10 trục thay đổi)`,
              `Lần kiểm tra: ${attempt}/3 · Không phát hiện dấu vân tay bị dùng lại`
            )
            break
          }

          originalityFeedback = report.feedback.length
            ? report.feedback
            : [...report.reusedFingerprints, ...report.similarPlotBeats]
          if (attempt === 2) {
            originalityFeedback = [
              'FINAL ATTEMPT: keep the independent parts that already passed, but surgically replace every concrete violation and similar event chain listed below.',
              ...(report.hardViolations || []),
              ...originalityFeedback
            ]
          }
          addLog(
            pid,
            'warn',
            `Dàn ý chưa đủ khác biệt (${report.score}/100) — sẽ tạo lại`,
            `Trục đã đổi: ${report.changedAxes.length} · Dấu vân tay: ${report.reusedFingerprints.join(' | ') || '(không rõ)'} · Nhịp sự kiện: ${report.similarPlotBeats.join(' | ') || '(không rõ)'} · Gợi ý: ${report.feedback.join(' | ') || '(không có)'}`
          )
        }

        if (!outline && bestOutline && bestReport?.usableWithWarning) {
          outline = bestOutline
          originalityReport = bestReport
          updateProjectById(pid, { outline: bestOutline, originalityReport: bestReport })
          addLog(
            pid,
            'warn',
            `Dàn ý dùng bản tốt nhất với cảnh báo (${bestReport.score}/100)`,
            `Còn ${bestReport.softSimilarities?.length || bestReport.similarPlotBeats.length} điểm tương đồng chung; không có vi phạm cụ thể.`
          )
        }

        if (!outline || (!originalityReport?.passed && !originalityReport?.usableWithWarning)) {
          throw new Error('Dàn ý không đạt kiểm định độc lập sau 3 lần. Vui lòng tăng mức biến đổi hoặc chỉnh lại nguồn đầu vào.')
        }

        updateProjectById(pid, { outline, outlineSummary: outline.outlineSummary })
        addLog(pid, 'success', `Dàn ý: "${outline.title}" — ${outline.chapters.length} chương`)
        updateRuntimeFor(pid, { generationProgress: 'Đang tạo tóm tắt tiếng Việt...' })

        const dupResult = checkDuplicate(
          outline.outlineSummary,
          get().projects.filter((x) => x.id !== pid).map((x) => ({
            id: x.id, title: x.name, outlineSummary: x.outlineSummary
          }))
        )
        updateRuntimeFor(pid, { duplicateResult: dupResult })
        if (dupResult.isDuplicate) {
          addLog(
            pid,
            'warn',
            `Phát hiện trùng ${Math.round(dupResult.maxSimilarity * 100)}% với "${dupResult.similarTo}"`,
            'Đây là kiểm tra với các dự án đã lưu; dàn ý vẫn đã vượt kiểm định nguồn tham khảo.'
          )
        }

        updateProjectById(pid, { viSummary: outline.outlineSummary, outlinePhase: 'reviewing' })
        updateRuntimeFor(pid, { generationProgress: '' })
        addLog(pid, 'success', 'Dàn ý hoàn tất, sẵn sàng để xem hoặc bắt đầu viết')

        // Tự động xuyên suốt: có dàn ý là viết luôn, không dừng ở màn xem trước.
        // Chỉ dừng khi phát hiện trùng lặp (cần người quyết). Chuyển tab không sao —
        // chuỗi bám theo pid đã khởi chạy, dự án khác không bị ảnh hưởng.
        const projNow = getProjectById(pid)
        if (projNow?.autoFlow && !isCancelled(pid)) {
          if (originalityReport?.usableWithWarning) {
            addLog(pid, 'warn', 'Tự động xuyên suốt tạm dừng để bạn duyệt bản tốt nhất còn cảnh báo')
          } else if (dupResult.isDuplicate) {
            addLog(pid, 'warn', 'Tự động xuyên suốt tạm dừng — phát hiện trùng cốt truyện, cần bạn xem lại')
          } else {
            addLog(pid, 'info', 'Tự động xuyên suốt — bắt đầu viết ngay...')
            chainedToWrite = true
            updateRuntimeFor(pid, { isGenerating: false })
            await get().confirmAndWrite(pid)
            return
          }
        }
      } catch (err) {
        const cancelled = err instanceof CancelledError || isCancelled(pid)
        reportFailure(pid, err, 'Tạo dàn ý thất bại')
        const snap = getProjectById(pid)
        if (snap?.outline) {
          // Chỉ hỏng/dừng ở bước tóm tắt — giữ outline lại để người dùng xem và viết tiếp
          updateProjectById(pid, { outlinePhase: 'reviewing' })
        } else if (cancelled) {
          // Dừng khi chưa có outline — quay về bước 2 thay vì kẹt ở màn hình trống
          updateProjectById(pid, { outlinePhase: 'idle', currentStep: 2, status: 'questions' })
        } else {
          updateProjectById(pid, { outlinePhase: 'generating-outline' })
        }
      } finally {
        clearCancel(pid)
        if (!chainedToWrite) {
          updateRuntimeFor(pid, { isGenerating: false, isCancelling: false, generationProgress: '' })
        }
      }
    },

    regenerateOutline: async () => { await get().generateOutline() },

    retryOutlineStronger: async () => {
      const pid = get().activeProjectId
      if (!pid) return
      const project = getProjectById(pid)
      if (!project) return
      const strongerLevel = getStrongerTransformationLevel(project.transformationLevel || 'original')
      updateProjectById(pid, { transformationLevel: strongerLevel, originalityReport: null })
      updateRuntimeFor(pid, { error: null })
      addLog(pid, 'info', `Thử lại với mức biến đổi mạnh hơn: ${strongerLevel}`)
      await get().generateOutline(pid)
    },

    confirmAndWrite: async (forPid?: string) => {
      const pid = typeof forPid === 'string' ? forPid : get().activeProjectId
      if (!pid) return
      const p = getProjectById(pid)
      if (!p || !p.outline) return
      if (p.inspirationProfile && !p.originalityReport?.passed && !p.originalityReport?.usableWithWarning) {
        updateRuntimeFor(pid, { error: 'Dàn ý chưa vượt kiểm định độc lập nên chưa thể bắt đầu viết.' })
        addLog(pid, 'warn', 'Đã chặn viết vì dàn ý chưa đạt kiểm định độc lập')
        return
      }
      const outline = p.outline
      const now = new Date().toISOString()

      // Initialize writing memory (persisted)
      const memory: import('@/types').WritingMemory = {
        completedChapters: 0,
        currentChapter: 0,
        currentChunk: 0,
        chapterCharsWritten: 0,
        totalChapters: outline.chapters.length,
        lastContext: p.userDirection.trim() ? `[Hướng dẫn bổ sung: ${p.userDirection.trim()}]` : '',
        startedAt: now,
        lastWriteAt: now
      }

      beginTask(pid)
      updateRuntimeFor(pid, {
        isGenerating: true, error: null, streamingText: '',
        generationProgress: `Đang viết chương 1/${outline.chapters.length}...`,
        lastAction: 'confirmAndWrite', writtenChapters: 0, totalChapters: outline.chapters.length,
        lastFailedChapter: -1, lastFailedChunk: -1
      })
      updateProjectById(pid, {
        generatedStory: '', outlinePhase: 'writing', status: 'writing',
        writingMemory: memory
      })
      // Hạn mức ký tự tính từ thời lượng + tốc độ đọc (tự khai hoặc mặc định theo ngôn ngữ),
      // KHÔNG lấy từ estimatedWords của AI
      const chapterBudgets = distributeCharBudget(outline.chapters, p.duration, p.language, p.readingSpeed)
      const totalBudget = targetCharsFor(p.duration, p.language, p.readingSpeed)
      addLog(pid, 'info', `Bắt đầu viết "${outline.title}" — ${outline.chapters.length} chương, hạn mức ${totalBudget.toLocaleString()} ký tự cho ${p.duration} phút`)

      try {
        // Không đặt tiêu đề truyện vào nội dung — bản này dùng để đọc/lồng tiếng
        let fullStory = ''
        let previousSummary: string | null = memory.lastContext || null

        for (let i = 0; i < outline.chapters.length; i++) {
          addLog(pid, 'info', `Bắt đầu chương ${i + 1}: "${outline.chapters[i].title}"`)
          updateRuntimeFor(pid, { writtenChapters: i })

          // Update memory before starting chapter
          updateProjectById(pid, {
            writingMemory: { ...memory, currentChapter: i, currentChunk: 0, lastWriteAt: new Date().toISOString() }
          })

          const result = await writeChapterChunked({
            pid, outline, chapterIndex: i, style: p.style, language: p.language,
            previousSummary, targetChars: chapterBudgets[i],
            enableHook: p.enableHook !== false,
            hookChars: p.enableHook !== false ? hookCharsFor(p.language, p.readingSpeed) : 0,
            customStyle: p.customStyle, customLanguage: p.customLanguage,
            userDirection: p.userDirection, storyNotes: p.storyNotes
          })

          fullStory += result.text + '\n\n'
          previousSummary = result.lastSummary

          // Update memory after completing chapter
          memory.completedChapters = i + 1
          memory.currentChapter = i + 1
          memory.currentChunk = 0
          memory.chapterCharsWritten = 0
          memory.lastContext = result.lastSummary
          memory.lastWriteAt = new Date().toISOString()

          const rt = get().runtimes[pid] || defaultRuntime()
          set({
            runtimes: { ...get().runtimes, [pid]: { ...rt, streamingText: rt.streamingText + '\n\n' } }
          })
          updateProjectById(pid, { generatedStory: fullStory, writingMemory: { ...memory } })
          addLog(pid, 'success', `Chương ${i + 1} hoàn thành (${result.text.length} ký tự)`)

          // Save to disk after each chapter
          const projSnap = getProjectById(pid)
          if (projSnap) await window.api.saveProject({ ...projSnap, updatedAt: new Date().toISOString() })
        }

        updateProjectById(pid, {
          generatedStory: fullStory.trim(), outlinePhase: 'done', status: 'done',
          writingMemory: null // Clear memory on completion
        })
        updateRuntimeFor(pid, { generationProgress: 'Hoàn thành!', writtenChapters: outline.chapters.length })
        addLog(pid, 'success', `Hoàn thành toàn bộ! ${fullStory.length.toLocaleString()} ký tự`)

        const final = getProjectById(pid)
        if (final) await window.api.saveProject({ ...final, updatedAt: new Date().toISOString() })
      } catch (err) {
        reportFailure(pid, err, 'Viết truyện thất bại')
        // Save current writingMemory so user can resume after app restart
        const projSnap = getProjectById(pid)
        if (projSnap) await window.api.saveProject({ ...projSnap, updatedAt: new Date().toISOString() })
      } finally {
        clearCancel(pid)
        updateRuntimeFor(pid, { isGenerating: false, isCancelling: false })
      }
    },

    // Continue writing from persisted writingMemory or runtime state
    continueWriting: async () => {
      const pid = get().activeProjectId
      if (!pid) return
      const p = getProjectById(pid)
      if (!p || !p.outline) return
      const outline = p.outline

      // Determine resume point: prefer persisted writingMemory, fallback to runtime
      const rt = get().runtimes[pid] || defaultRuntime()
      let startChapter: number
      let startChunk: number
      let previousSummary: string | null

      if (p.writingMemory) {
        // Resume from persisted memory (e.g., after app restart)
        startChapter = p.writingMemory.completedChapters
        startChunk = p.writingMemory.currentChunk
        previousSummary = p.writingMemory.lastContext || null
        addLog(pid, 'info', `Phục hồi từ bộ nhớ: đã viết ${p.writingMemory.completedChapters}/${p.writingMemory.totalChapters} chương`)
      } else {
        // Fallback to runtime state (error during current session)
        startChapter = rt.lastFailedChapter >= 0 ? rt.lastFailedChapter : rt.writtenChapters
        startChunk = rt.lastFailedChunk >= 0 ? rt.lastFailedChunk : 0
        previousSummary = p.generatedStory ? p.generatedStory.slice(-500) : null
      }

      if (startChapter >= outline.chapters.length) {
        addLog(pid, 'info', 'Tất cả chương đã hoàn thành')
        updateProjectById(pid, { outlinePhase: 'done', status: 'done', writingMemory: null })
        return
      }

      beginTask(pid)
      updateRuntimeFor(pid, {
        isGenerating: true, error: null, lastAction: 'confirmAndWrite',
        writtenChapters: startChapter, totalChapters: outline.chapters.length,
        generationProgress: `Tiếp tục từ chương ${startChapter + 1}...`
      })
      updateProjectById(pid, { outlinePhase: 'writing', status: 'writing' })
      addLog(pid, 'info', `Tiếp tục từ chương ${startChapter + 1}, khối ${startChunk + 1}`)

      // Hạn mức ký tự tính lại từ thời lượng + tốc độ đọc (giống lúc viết mới)
      const chapterBudgets = distributeCharBudget(outline.chapters, p.duration, p.language, p.readingSpeed)

      try {
        let fullStory = p.generatedStory || ''

        for (let i = startChapter; i < outline.chapters.length; i++) {
          const chunkStart = i === startChapter ? startChunk : 0
          // Số ký tự đã viết cho chương đang dở; chương mới thì bắt đầu từ 0.
          // Dự án cũ chưa có chapterCharsWritten thì tạm suy từ số khối đã xong.
          const alreadyWritten =
            i === startChapter && chunkStart > 0
              ? p.writingMemory?.chapterCharsWritten ?? chunkStart * CHUNK_CHARS
              : 0
          addLog(pid, 'info', `Viết chương ${i + 1}: "${outline.chapters[i].title}"`)
          updateRuntimeFor(pid, { writtenChapters: i })

          // Update memory
          const mem: import('@/types').WritingMemory = {
            completedChapters: i,
            currentChapter: i,
            currentChunk: chunkStart,
            chapterCharsWritten: alreadyWritten,
            totalChapters: outline.chapters.length,
            lastContext: previousSummary || '',
            startedAt: p.writingMemory?.startedAt || new Date().toISOString(),
            lastWriteAt: new Date().toISOString()
          }
          updateProjectById(pid, { writingMemory: mem })

          const result = await writeChapterChunked({
            pid, outline, chapterIndex: i, style: p.style, language: p.language,
            previousSummary, targetChars: chapterBudgets[i],
            alreadyWrittenChars: alreadyWritten,
            enableHook: p.enableHook !== false,
            hookChars: p.enableHook !== false ? hookCharsFor(p.language, p.readingSpeed) : 0,
            customStyle: p.customStyle, customLanguage: p.customLanguage,
            startChunkIndex: chunkStart, userDirection: p.userDirection,
            storyNotes: p.storyNotes
          })

          fullStory += result.text + '\n\n'
          previousSummary = result.lastSummary

          // Update memory after chapter complete
          mem.completedChapters = i + 1
          mem.currentChapter = i + 1
          mem.currentChunk = 0
          mem.chapterCharsWritten = 0
          mem.lastContext = result.lastSummary
          mem.lastWriteAt = new Date().toISOString()

          const rt2 = get().runtimes[pid] || defaultRuntime()
          set({
            runtimes: { ...get().runtimes, [pid]: { ...rt2, streamingText: rt2.streamingText + '\n\n' } }
          })
          updateProjectById(pid, { generatedStory: fullStory, writingMemory: { ...mem } })
          addLog(pid, 'success', `Chương ${i + 1} hoàn thành`)

          const projSnap = getProjectById(pid)
          if (projSnap) await window.api.saveProject({ ...projSnap, updatedAt: new Date().toISOString() })
        }

        updateProjectById(pid, {
          generatedStory: fullStory.trim(), outlinePhase: 'done', status: 'done',
          writingMemory: null
        })
        updateRuntimeFor(pid, {
          generationProgress: 'Hoàn thành!', writtenChapters: outline.chapters.length,
          lastFailedChapter: -1, lastFailedChunk: -1
        })
        addLog(pid, 'success', 'Hoàn thành toàn bộ!')

        const final = getProjectById(pid)
        if (final) await window.api.saveProject({ ...final, updatedAt: new Date().toISOString() })
      } catch (err) {
        reportFailure(pid, err, 'Lỗi tiếp tục viết')
        // Save memory for future resume
        const projSnap = getProjectById(pid)
        if (projSnap) await window.api.saveProject({ ...projSnap, updatedAt: new Date().toISOString() })
      } finally {
        clearCancel(pid)
        updateRuntimeFor(pid, { isGenerating: false, isCancelling: false })
      }
    },

    // Dừng mọi tác vụ AI đang chạy của dự án hiện tại.
    // Phần đã viết + writingMemory được giữ nguyên nên có thể "Viết tiếp" sau đó.
    stopGeneration: () => {
      const pid = get().activeProjectId
      if (!pid) return
      const rt = get().runtimes[pid] || defaultRuntime()
      if (!rt.isGenerating && !rt.isLoadingQuestions) return
      if (rt.isCancelling) return

      updateRuntimeFor(pid, { isCancelling: true, generationProgress: 'Đang dừng...' })
      addLog(pid, 'warn', 'Đang dừng — huỷ các request đang chạy...')
      abortOwner(pid)
    },

    // Retry the last failed action
    retryLastAction: async () => {
      const pid = get().activeProjectId
      if (!pid) return
      const rt = get().runtimes[pid] || defaultRuntime()
      updateRuntimeFor(pid, { error: null })

      switch (rt.lastAction) {
        case 'generateQuestions': return get().generateQuestions()
        case 'generateOutline': return get().generateOutline()
        case 'confirmAndWrite': return get().continueWriting()
        default: addLog(pid, 'warn', 'Không có hành động nào để thử lại')
      }
    },

    exportProject: async (id, format) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      await window.api.exportStory(project, format)
    }
  }
})
