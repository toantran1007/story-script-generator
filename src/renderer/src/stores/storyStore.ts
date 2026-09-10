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
  TransformationLevel,
  IdeaInputType
} from '@/types'
import { DEFAULT_SETTINGS, createEmptyProject, normalizeSettings, recoverStaleProject } from '@/types'
import {
  chat,
  chatStream,
  abortOwner,
  waitOwnerIdle,
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
  buildPostStoryHookPrompt,
  normalizeOriginalityReport,
  getStrongerTransformationLevel,
  originalityCandidateRank
} from '@/services/promptEngine'
import { checkDuplicate } from '@/services/similarityCheck'
import { findForbiddenFingerprints } from '@/services/originalityCheck'
import { stripNarrationMarkup } from '@/services/textCleanup'
import { distributeCharBudget, chapterBudgetsFor, chapterOutputBudget, targetCharsFor, hookCharsFor, normalizeDuration, charsPerMinute } from '@/services/textMetrics'
import { hasTargetLanguageLeak } from '@/services/languageGuard'
import { verifiedHookExcerpt } from '@/services/hookExcerpt'
import { WRITING_CONTEXT_CHARS, WRITING_MEMORY_CONTRACT, visibleStoryText, parseWritingResponse, memoryContext,
  WritingResponseError, writingResponseCounts, responseCountLabel } from '@/services/chapterMemory'
import { applyMemoryPayload } from '@/services/detailedMemory'
import { CONTINUITY_RULES } from '@/services/continuityRules'
import { numberedDraft } from '@/services/sentenceEvidence'
import { applyChapterCorrection, chapterReferenceContext, CHAPTER_CORRECTION_CONTRACT } from '@/services/chapterCorrection'
import { restoreWorkspace, writingPreferences, WRITING_PREFERENCE_KEYS, type WritingPreferences, type WorkspaceSession } from '@/services/workspaceSession'

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

class OutlineValidationError extends Error {}

function parseOutlineResponse(text: string): Outline {
  const value = safeParseJSON<Outline>(text)
  if (!value) throw new OutlineValidationError('Phản hồi không phải JSON dàn ý hợp lệ hoặc bị cắt dở.')
  const nonEmpty = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0
  if (!nonEmpty(value.title) || !nonEmpty(value.outlineSummary) ||
    !Array.isArray(value.chapters) || value.chapters.length === 0 ||
    !value.chapters.every((chapter, index) => chapter && chapter.chapter === index + 1 &&
      nonEmpty(chapter.title) && nonEmpty(chapter.summary) &&
      typeof chapter.estimatedWords === 'number' && Number.isFinite(chapter.estimatedWords) && chapter.estimatedWords > 0)) {
    throw new OutlineValidationError('Dàn ý thiếu hoặc sai title, outlineSummary hay danh sách chương (chapter, title, summary, estimatedWords).')
  }
  return value
}

function legacySettingEraCore(value: Partial<InspirationProfile>): string[] {
  const explicit = strings(value.settingEraCore)
  if (explicit.length > 0) return explicit
  const settingHints = /(?:world|era|period|contemporary|modern|present|historical|ancient|medieval|future|apocalypse|zombie|two worlds|cross.world|thoi|hien dai|duong dai|co dai|trung co|tuong lai|mat the|tang thi|hai the gioi|xuyen khong)/i
  return strings(value.forbiddenSettings).filter((item) => {
    const normalized = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    return settingHints.test(normalized)
  }).slice(0, 8)
}

function normalizeInspirationProfile(value: Partial<InspirationProfile> | null | undefined): InspirationProfile | null {
  if (!value || typeof value.creativeBrief !== 'string' || !value.creativeBrief.trim()) return null
  const sourceTypes = ['short-idea', 'summary', 'outline', 'full-story'] as const
  return {
    sourceType: sourceTypes.includes(value.sourceType as typeof sourceTypes[number])
      ? value.sourceType as InspirationProfile['sourceType']
      : 'short-idea',
    sourceGenreTags: strings(value.sourceGenreTags),
    genreCore: strings(value.genreCore),
    settingEraCore: legacySettingEraCore(value),
    storyCore: strings(value.storyCore),
    progressionCore: strings(value.progressionCore),
    audiencePromise: strings(value.audiencePromise),
    avoidGenreDrift: strings(value.avoidGenreDrift),
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

function parseInspirationProfile(text: string): InspirationProfile | null {
  return normalizeInspirationProfile(safeParseJSON<Partial<InspirationProfile>>(text))
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
    plotSimilarity: typeof value.plotSimilarity === 'number' ? value.plotSimilarity : undefined,
    genreFidelityScore: typeof value.genreFidelityScore === 'number' ? value.genreFidelityScore : undefined,
    genreEvidence: strings(value.genreEvidence),
    missingGenreElements: strings(value.missingGenreElements),
    genreDrift: strings(value.genreDrift),
    settingFidelityScore: typeof value.settingFidelityScore === 'number' ? value.settingFidelityScore : undefined,
    settingEvidence: strings(value.settingEvidence),
    settingDrift: strings(value.settingDrift)
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
  lastAction: 'generateQuestions' | 'generateOutline' | 'confirmAndWrite' | 'generateHook' | null
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
  dataRoot: string
  trashedProjects: { id: string; name: string; deletedAt: string }[]
  loadStorageInfo: () => Promise<void>
  restoreProject: (id: string) => Promise<void>
  projectsLoaded: boolean
  latestWritingPreferences: WritingPreferences | null
  saveError: string | null
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
  flushProjects: () => boolean
  saveNow: () => Promise<boolean>

  // Project CRUD
  createProject: (name: string) => Promise<void>
  openProject: (id: string) => void
  closeTab: (id: string) => void
  switchTab: (id: string) => void
  deleteProject: (id: string) => Promise<void>
  goToDashboard: () => void

  // Active project field setters
  setIdea: (v: string) => void
  setIdeaInputType: (v: IdeaInputType) => void
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
  regenerateHook: () => Promise<void>
  exportProject: (id: string, format: string, includeHook?: boolean) => Promise<void>

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
const deletingProjects = new Set<string>()
let workspaceDirty = false
let workspaceRevision = 0
let saveInFlight: Promise<boolean> | null = null
let projectsLoading: Promise<void> | null = null
let checkpointGeneration = 0

function workspaceSnapshot(): WorkspaceSession {
  const state = useAppStore.getState()
  return { openTabs: state.openTabs, activeProjectId: state.activeProjectId, currentView: state.currentView,
    writingPreferences: state.latestWritingPreferences || writingPreferences(state.getActiveProject()) }
}

function markWorkspaceDirty(): void {
  workspaceDirty = true
  workspaceRevision++
  scheduleAutoSave()
}

function markDirty(pid: string): void {
  dirtyProjects.add(pid)
  scheduleAutoSave()
}

function scheduleAutoSave(): void {
  if (autoSaveTimer) return
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null
    void flushDirtyProjects()
  }, 800)
}

async function flushDirtyProjects(): Promise<boolean> {
  if (saveInFlight && !await saveInFlight) return false
  const snapshots = useAppStore.getState().projects.filter((project) => dirtyProjects.has(project.id) && !deletingProjects.has(project.id))
  if (!snapshots.length && !workspaceDirty) return true
  const session = workspaceDirty ? workspaceSnapshot() : null
  const revision = workspaceRevision
  const checkpoint = checkpointGeneration
  const operation = (async (): Promise<boolean> => {
    try {
      for (const project of snapshots) {
        if (deletingProjects.has(project.id)) continue
        if (checkpoint !== checkpointGeneration) return true
        await window.api.saveProject(project)
        if (useAppStore.getState().projects.find((item) => item.id === project.id) === project) dirtyProjects.delete(project.id)
      }
      if (session) {
        if (checkpoint !== checkpointGeneration) return true
        await window.api.saveWorkspace(session)
        if (revision === workspaceRevision) workspaceDirty = false
      }
      useAppStore.setState({ saveError: null })
      return true
    } catch {
      useAppStore.setState({ saveError: 'Chưa lưu được thay đổi. Dữ liệu vẫn được giữ trong phiên này; hãy thử lưu lại trước khi đóng.' })
      return false
    }
  })()
  saveInFlight = operation
  const success = await operation
  if (saveInFlight === operation) saveInFlight = null
  if (success && (dirtyProjects.size || workspaceDirty)) scheduleAutoSave()
  return success
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
    if (deletingProjects.has(activeProjectId)) return
    const idx = projects.findIndex((p) => p.id === activeProjectId)
    if (idx < 0) return
    const updated = { ...projects[idx], ...fields, updatedAt: new Date().toISOString() }
    const next = [...projects]
    next[idx] = updated
    set({ projects: next })
    markDirty(activeProjectId)
    if (WRITING_PREFERENCE_KEYS.some((key) => Object.hasOwn(fields, key))) {
      set({ latestWritingPreferences: writingPreferences(updated) })
      markWorkspaceDirty()
    }
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
    if (deletingProjects.has(id)) return
    const { runtimes } = get()
    set({
      runtimes: {
        ...runtimes,
        [id]: { ...(runtimes[id] || defaultRuntime()), ...fields }
      }
    })
  }

  function updateProjectById(id: string, fields: Partial<Project>): void {
    if (deletingProjects.has(id)) return
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
    if (deletingProjects.has(id)) return null
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
    inspirationProfile?: InspirationProfile | null
    startChunkIndex?: number
    userDirection?: string
    storyNotes?: string
  }): Promise<{ text: string; lastSummary: string; charsWritten: number }> {
    if (getProjectById(args.pid)?.writingEngine === 'chapter-v2') return writeWholeChapter(args)
    const {
      pid, outline, chapterIndex, style, language, previousSummary,
      targetChars, customStyle, customLanguage, inspirationProfile, userDirection, storyNotes, enableHook
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
        firstMinuteChars: charsPerMinute(language, getProjectById(pid)?.readingSpeed),
        previousContext: getProjectById(pid)?.generatedStory.slice(-WRITING_CONTEXT_CHARS) || memory || null,
        hasNarrativeMemory: Boolean(getProjectById(pid)?.storyMemory),
        userDirection,
        storyNotes,
        premise: getProjectById(pid)?.idea,
        customStyle,
        customLanguage,
        inspirationProfile
      })

      try {
        const streamPrefix = (get().runtimes[pid] || defaultRuntime()).streamingText
        let result: ReturnType<typeof parseWritingResponse> | null = null
        let lastResponseError: WritingResponseError | null = null
        for (let responseAttempt = 1; responseAttempt <= 3; responseAttempt++) {
          const retryInstruction = lastResponseError
            ? `\nThe previous response failed validation (${lastResponseError.code}). Return non-empty story prose followed by the required memory delimiter and valid memory JSON. Do not shorten a valid story merely to fit a first-minute character count.` : ''
          let streamed = ''
          const snapshot = getProjectById(pid)
          if (!snapshot) throw new CancelledError()
          const selectedMemory = memoryContext(snapshot, chapterIndex + 1)
          const coverage = JSON.parse(selectedMemory).coverage as { selectedRecords: number; totalRecords: number }
          addLog(pid, 'info', `Memory gửi AI: ${coverage.selectedRecords}/${coverage.totalRecords} dữ kiện · ${selectedMemory.length.toLocaleString()} ký tự`)
          const rawChunk = await chatStream(
            [{ role: 'system', content: `${system}\n\n${WRITING_MEMORY_CONTRACT}` },
              { role: 'user', content: `${user}${retryInstruction}\n\nSAVED CHAPTER/GLOBAL MEMORY:\n${selectedMemory}` }],
            (token) => {
              if (deletingProjects.has(pid) || !getProjectById(pid)) return
              streamed += token
              const { runtimes } = get()
              const rt = runtimes[pid] || defaultRuntime()
              set({
                runtimes: { ...get().runtimes, [pid]: { ...rt, streamingText: streamPrefix + visibleStoryText(streamed) } }
              })
            },
            undefined,
            pid
          )
          if (isCancelled(pid)) throw new CancelledError()
          try {
            result = parseWritingResponse(rawChunk)
            addLog(pid, 'info', `Đúng cấu trúc — chương ${chapterIndex + 1}, khối ${chunk + 1}: ${responseCountLabel(writingResponseCounts(rawChunk))}`)
            break
          } catch (error) {
            if (!(error instanceof WritingResponseError)) throw error
            lastResponseError = error
            updateRuntimeFor(pid, { streamingText: streamPrefix })
            if (responseAttempt === 3) throw new Error(`Không nhận được khối truyện–memory hợp lệ sau 3 lần. ${error.message}`)
            addLog(pid, 'warn', `Chương ${chapterIndex + 1}, khối ${chunk + 1}: ${error.message} Thử lại lần ${responseAttempt + 1}/3.`)
            updateRuntimeFor(pid, { generationProgress: `Chương ${chapterIndex + 1} · Khối ${chunk + 1} · Thử lại ${responseAttempt + 1}/3 (${error.code})` })
          }
        }

        // Bỏ tiêu đề / nhãn chương / ký hiệu markdown để văn bản đọc được ngay
        if (!result) throw new Error('Không nhận được dữ liệu truyện–memory hợp lệ')
        let cleanChunk = stripNarrationMarkup(result.text)
        if (hasTargetLanguageLeak(cleanChunk, language, customLanguage)) {
          addLog(pid, 'warn', `Phát hiện khối ${chunk + 1} bị lẫn ngôn ngữ — đang tự sửa`)
          updateRuntimeFor(pid, { generationProgress: `Đang sửa ngôn ngữ khối ${chunk + 1}...` })
          const repair = buildLanguageRepairPrompt(cleanChunk, language, customLanguage)
          const repairedResponse = await chat(
            [{ role: 'system', content: `${repair.system}\n\n${WRITING_MEMORY_CONTRACT}\nUpdate the attached memory consistently with any language/name repairs. Do not advance the story.` },
              { role: 'user', content: `${repair.user}\nMEMORY TO KEEP CONSISTENT:\n${JSON.stringify(result.memory)}` }],
            undefined,
            pid
          )
          result = parseWritingResponse(repairedResponse)
          const repaired = stripNarrationMarkup(result.text)
          if (hasTargetLanguageLeak(repaired, language, customLanguage)) {
            throw new Error(`Khối ${chunk + 1} vẫn bị lẫn ngôn ngữ sau khi tự sửa`)
          }
          cleanChunk = repaired
          updateRuntimeFor(pid, { streamingText: streamPrefix + cleanChunk })
          addLog(pid, 'success', `Đã sửa ngôn ngữ khối ${chunk + 1}`)
        }
        if (!cleanChunk.trim()) throw new Error('Khối truyện rỗng sau làm sạch; chưa lưu khối này.')
        if (isCancelled(pid) || !getProjectById(pid)) throw new CancelledError()
        // Khối mới thường bắt đầu ngay bằng chữ; nếu không có khoảng trắng ở chỗ nối
        // thì câu cuối khối trước sẽ dính liền câu đầu khối sau. Khi viết tiếp sau khi
        // dừng, chapterText rỗng nên phải so với phần truyện đã lưu.
        const prevTail = chapterText || getProjectById(pid)?.generatedStory || ''
        if (cleanChunk.trim().length >= 80 && prevTail.trimEnd().endsWith(cleanChunk.trim())) {
          updateRuntimeFor(pid, { streamingText: streamPrefix })
          throw new Error('AI trả lại nguyên khối vừa viết. Khối trùng chưa được lưu; hãy thử lại khối hiện tại.')
        }
        const needsBreak = prevTail.trim() !== '' && /\S$/.test(prevTail) && /^\S/.test(cleanChunk)
        const chunkText = (needsBreak ? '\n\n' : '') + cleanChunk

        chapterText += chunkText
        memory = ((getProjectById(pid)?.generatedStory || '') + chunkText).slice(-WRITING_CONTEXT_CHARS)
        written += cleanChunk.length

        // Update project with partial progress + ghi nhớ vị trí khối,
        // để dừng/khôi phục giữa chương không viết lại đoạn đã có
        const proj = getProjectById(pid)
        if (proj) {
          const memoryPatch = applyMemoryPayload(proj, chapterIndex + 1, chunk, isLastChunk, cleanChunk, result.memory)
          updateProjectById(pid, {
            generatedStory: proj.generatedStory + chunkText,
            ...memoryPatch,
            writingMemory: proj.writingMemory
              ? {
                  ...proj.writingMemory,
                  completedChapters: isLastChunk ? chapterIndex + 1 : proj.writingMemory.completedChapters,
                  currentChapter: isLastChunk ? chapterIndex + 1 : chapterIndex,
                  currentChunk: isLastChunk ? 0 : chunk + 1,
                  chapterCharsWritten: isLastChunk ? 0 : written,
                  lastContext: memory,
                  lastWriteAt: new Date().toISOString()
                }
              : proj.writingMemory
          })
          for (const issue of memoryPatch.memoryIssues?.slice(proj.memoryIssues?.length || 0) || []) {
            addLog(pid, 'warn', `Memory chưa xác thực [${issue.code}] · ID ${issue.recordId} · chương ${issue.chapter}, khối ${issue.chunk + 1}. Đã giữ ${issue.storyChars} ký tự truyện, không gọi viết lại.`,
              `Dẫn chứng (${issue.suppliedEvidence.length} ký tự): ${issue.suppliedEvidence.slice(0, 300)}${issue.suppliedEvidence.length > 300 ? '…' : ''}`)
          }
          updateRuntimeFor(pid, { streamingText: streamPrefix + chunkText })
          const savedChunk = getProjectById(pid)
          if (savedChunk) await window.api.saveProject(savedChunk)
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

    return { text: chapterText, lastSummary: (getProjectById(pid)?.generatedStory || chapterText).slice(-WRITING_CONTEXT_CHARS), charsWritten: written }
  }

  async function writeWholeChapter(args: Parameters<typeof writeChapterChunked>[0]): Promise<{ text: string; lastSummary: string; charsWritten: number }> {
    const { pid, chapterIndex, outline } = args
    const project = getProjectById(pid)
    if (!project || isCancelled(pid)) throw new CancelledError()
    const selectedMemory = chapterReferenceContext(project, chapterIndex + 1)
    const prompt = buildChapterChunkPrompt(outline, chapterIndex, args.style, args.language, {
      chunkIndex: 0, totalChunks: 1, targetChars: args.targetChars, isLastChunk: true,
      enableHook: false, hookWindowChars: 0,
      firstMinuteChars: charsPerMinute(args.language, project.readingSpeed),
      previousContext: project.generatedStory.slice(-WRITING_CONTEXT_CHARS) || args.previousSummary,
      hasNarrativeMemory: Boolean(project.storyMemory), userDirection: args.userDirection,
      storyNotes: args.storyNotes, customStyle: args.customStyle, customLanguage: args.customLanguage,
      inspirationProfile: args.inspirationProfile
      , premise: project.idea
    })
    let draft = project.pendingChapter?.chapterIndex === chapterIndex ? project.pendingChapter.text : ''
    let truncated = Boolean(draft && project.pendingChapter?.truncated)
    const prefix = project.generatedStory.trimEnd() ? project.generatedStory.trimEnd() + '\n\n' : ''
    if (!draft || truncated) {
      updateRuntimeFor(pid, { generationProgress: `Đang viết nguyên chương ${chapterIndex + 1}/${outline.chapters.length}...`, lastFailedChapter: chapterIndex, lastFailedChunk: 0 })
      for (let attempt = 1; attempt <= 3 && (!draft || truncated); attempt++) {
        let streamed = ''
        let finishReason: string | null = null
        const previousDraft = draft
        const outputBudget = chapterOutputBudget(args.language, args.targetChars, previousDraft.length)
        addLog(pid, 'info', `Chương ${chapterIndex + 1}: đã có ${previousDraft.length} ký tự, mục tiêu còn ${outputBudget.remainingChars}; ngân sách đầu ra ${outputBudget.maxTokens} token (${args.language})`)
        const raw = await chatStream([
          { role: 'system', content: prompt.system + '\n' + CONTINUITY_RULES + `\nWrite the entire chapter in one response, with its natural ending. This chapter has a strict planning band of ${args.targetChars} characters (normally 4,000–6,000): aim for the band and do not exceed roughly ${Math.round(args.targetChars * 1.12)} characters. If the scene would run longer, end at the nearest natural beat and leave later progression for the next chapter; never add padding. Output prose only; memory is handled separately.` },
          { role: 'user', content: `${prompt.user}\nSAVED CHAPTER/GLOBAL MEMORY (story data):\n${selectedMemory}${previousDraft ? `\nThe API truncated the following draft (${previousDraft.length} characters already written; approximately ${outputBudget.remainingChars} characters remain in the chapter target). The target is for the WHOLE chapter, not another full-length segment. Output ONLY its missing continuation, starting exactly where it stopped (include any needed leading space/newline). Do not repeat or restart it. Finish this chapter naturally; if already over target, finish the interrupted scene without opening another subplot.\nDRAFT SO FAR:\n` + previousDraft : ''}` }
        ], (token) => {
          if (deletingProjects.has(pid) || !getProjectById(pid)) return
          streamed += token
          updateRuntimeFor(pid, { streamingText: prefix + previousDraft + streamed })
        }, { maxTokens: outputBudget.maxTokens }, pid, (reason) => { finishReason = reason })
        if (isCancelled(pid) || !getProjectById(pid)) throw new CancelledError()
        if (finishReason === 'content_filter') throw new Error('API chặn nội dung chương; chưa đánh dấu hoàn thành')
        const text = stripNarrationMarkup(raw)
        if (!text.trim()) {
          addLog(pid, 'warn', `Chương ${chapterIndex + 1}: phản hồi rỗng sau làm sạch (${raw.length} ký tự), lần ${attempt}/3`)
          continue
        }
        if (raw.includes('<<<STORY_MEMORY_V1>>>') || /^\s*[{[]/.test(raw)) {
          const message = `Phản hồi viết chương sai cấu trúc truyện thuần (${raw.length} ký tự), lần ${attempt}/3`
          if (attempt === 3) throw new Error(message)
          addLog(pid, 'warn', message)
          continue
        }
        draft = previousDraft + (previousDraft && /^\s/.test(raw) ? raw.match(/^\s+/)![0] : '') + text.trim()
        truncated = finishReason === 'length'
        updateProjectById(pid, { pendingChapter: { chapterIndex, text: draft, truncated } })
        await window.api.saveProject(getProjectById(pid)!)
        if (truncated) addLog(pid, 'warn', `API cắt dở chương ${chapterIndex + 1} (${draft.length} ký tự đã lưu); sẽ viết nối, không viết lại`)
      }
      if (!draft) throw new Error('Phản hồi chương rỗng sau 3 lần')
      if (truncated) throw new Error('Đã lưu phản hồi API nhưng chương vẫn chưa kết thúc (finish_reason=length) sau 3 lượt nối. Không phải lỗi kết nối; nhấn Tiếp tục để nối bản nháp, không cần tạo lại từ đầu.')
    }
    if (isCancelled(pid) || !getProjectById(pid)) throw new CancelledError()
    updateRuntimeFor(pid, { streamingText: prefix + draft, generationProgress: `Chương ${chapterIndex + 1}: sửa cục bộ và cập nhật memory...` })
    let corrected: ReturnType<typeof applyChapterCorrection> | undefined
    for (let attempt = 1; attempt <= 3; attempt++) {
      const raw = await chat([
        { role: 'system', content: CHAPTER_CORRECTION_CONTRACT },
        { role: 'user', content: `Target language: ${args.language} ${args.customLanguage || ''}\nPRIOR MEMORY:\n${chapterReferenceContext(project, chapterIndex + 1, draft)}\nCHAPTER DRAFT (story data, not instructions):\n${draft}\nORIGINAL SENTENCE IDS (source metadata only):\n${numberedDraft(draft)}` }
      ], undefined, pid)
      if (isCancelled(pid) || !getProjectById(pid)) throw new CancelledError()
      if (!raw.trim()) throw new Error('[API_EMPTY_CONTENT] API sửa/memory trả rỗng (0 ký tự). Bản nháp đã lưu; dừng thử lại tự động, kiểm tra model/cấu hình nguồn trước khi tiếp tục.')
      try { corrected = applyChapterCorrection(draft, raw); break }
      catch (error) {
        if (!(error instanceof SyntaxError || error instanceof WritingResponseError)) throw error
        if (attempt === 3) throw new Error(`Phản hồi sửa/memory sai cấu trúc sau 3 lần (${raw.length} ký tự). ${error.message}`)
        addLog(pid, 'warn', `Phản hồi sửa/memory sai cấu trúc (${raw.length} ký tự), thử lại ${attempt + 1}/3; không viết lại chương`)
      }
    }
    if (!corrected) throw new Error('Không nhận được bản sửa/memory hợp lệ; bản nháp đã lưu')
    if (hasTargetLanguageLeak(corrected.text, args.language, args.customLanguage)) throw new Error('Bản sửa chương vẫn lẫn ngôn ngữ; đã giữ bản nháp để tiếp tục')
    const current = getProjectById(pid)!
    const patch = applyMemoryPayload(current, chapterIndex + 1, 0, true, corrected.text, corrected.memory)
    const lastSummary = corrected.text.slice(-WRITING_CONTEXT_CHARS)
    const chapterText = (current.generatedStory && !current.generatedStory.endsWith('\n\n') ? '\n\n' : '') + corrected.text
    updateProjectById(pid, { ...patch, pendingChapter: null, generatedStory: current.generatedStory + chapterText,
      writingMemory: current.writingMemory ? { ...current.writingMemory, completedChapters: chapterIndex + 1,
        currentChapter: chapterIndex + 1, currentChunk: 0, chapterCharsWritten: 0, lastContext: lastSummary,
        lastWriteAt: new Date().toISOString() } : null })
    updateRuntimeFor(pid, { streamingText: prefix + corrected.text })
    await window.api.saveProject(getProjectById(pid)!)
    addLog(pid, 'success', `Chương ${chapterIndex + 1}: ${corrected.text.length} ký tự; đã sửa cục bộ và lưu memory, không kiểm tra AI lần hai`)
    return { text: chapterText, lastSummary, charsWritten: corrected.text.length }
  }

  async function finalizeStory(pid: string): Promise<void> {
    const project = getProjectById(pid)
    if (!project?.generatedStory.trim()) return
    if (isCancelled(pid)) throw new CancelledError()
    updateProjectById(pid, { writingMemory: null, status: 'done', outlinePhase: 'done' })
    addLog(pid, 'success', 'Đã viết xong và lưu memory các chương — không gọi rà soát toàn truyện')
    const saved = getProjectById(pid)
    if (saved) await window.api.saveProject(saved)
    await generateHookForProject(pid)
  }

  // Hook is edited after the complete story exists, so it can quote a real high-impact scene.
  async function generateHookForProject(pid: string, force = false): Promise<void> {
    const project = getProjectById(pid)
    if (!project?.generatedStory.trim() || project.enableHook === false || (!force && project.hookText.trim())) return

    if (isCancelled(pid)) throw new CancelledError()
    updateRuntimeFor(pid, {
      isGenerating: true,
      error: null,
      streamingText: project.generatedStory,
      generationProgress: 'Đang chọn cảnh ấn tượng để tạo hook...',
      lastAction: 'generateHook'
    })
    addLog(pid, 'info', 'Phân tích full truyện để chọn cảnh làm hook...')

    try {
      const maxHookSourceChars = 120_000
      const source = project.generatedStory.length <= maxHookSourceChars
        ? project.generatedStory
        : `${project.generatedStory.slice(0, maxHookSourceChars / 2)}\n\n[...phần giữa truyện được rút gọn để giữ giới hạn ngữ cảnh...]\n\n${project.generatedStory.slice(-maxHookSourceChars / 2)}`
      const prompt = buildPostStoryHookPrompt(
        source,
        project.style,
        project.language,
        Math.min(4_000, Math.max(800, hookCharsFor(project.language, project.readingSpeed))),
        project.customStyle,
        project.customLanguage,
        project.inspirationProfile,
        charsPerMinute(project.language, project.readingSpeed)
      )
      let hook = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await chat(
          [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
          { temperature: 0.1 }, pid
        )
        if (isCancelled(pid) || !getProjectById(pid)) throw new CancelledError()
        try {
          hook = verifiedHookExcerpt(project.generatedStory, response, Math.min(4000, Math.max(800, hookCharsFor(project.language, project.readingSpeed))))
          break
        } catch (error) {
          addLog(pid, 'warn', `Hook lần ${attempt}/3 không khớp nguyên văn truyện`)
          if (attempt === 3) throw error
        }
      }
      if (getProjectById(pid)?.generatedStory !== project.generatedStory || getProjectById(pid)?.enableHook === false) throw new CancelledError()

      updateProjectById(pid, { hookText: hook })
      addLog(pid, 'success', `Đã tạo hook từ cảnh nổi bật (${hook.length.toLocaleString()} ký tự)`)
      const saved = getProjectById(pid)
      if (saved) await window.api.saveProject({ ...saved, updatedAt: new Date().toISOString() })
    } catch (err) {
      if (!(err instanceof CancelledError)) {
        reportFailure(pid, err, 'Tạo hook thất bại')
      }
    } finally {
      clearCancel(pid)
      updateRuntimeFor(pid, { isGenerating: false, isCancelling: false, streamingText: '' })
    }
  }

  return {
    dataRoot: '',
    trashedProjects: [],
    loadStorageInfo: async () => {
      try {
        const [dataRoot, deleted] = await Promise.all([window.api.getDataRoot(), window.api.getDeletedProjects()])
        set({ dataRoot, trashedProjects: deleted as { id: string; name: string; deletedAt: string }[] })
      } catch { set({ saveError: 'Không đọc được thông tin thư mục dữ liệu. Hãy mở lại bản tool mới nhất.' }) }
    },
    restoreProject: async (id) => {
      try {
        const restored = await window.api.restoreProject(id) as Project
        deletingProjects.delete(id)
        const project = recoverStaleProject({ ...createEmptyProject(restored.id, restored.name), ...restored })
        set((s) => ({ projects: [...s.projects.filter((p) => p.id !== id), project],
          trashedProjects: s.trashedProjects.filter((p) => p.id !== id), saveError: null }))
        get().openProject(id)
      } catch { set({ saveError: 'Không khôi phục được dự án. Dữ liệu trong thùng rác vẫn được giữ.' }) }
    },
    projectsLoaded: false,
    latestWritingPreferences: null,
    saveError: null,
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
    loadProjects: () => {
      if (get().projectsLoaded) return Promise.resolve()
      if (projectsLoading) return projectsLoading
      projectsLoading = (async () => {
        const [rawProjects, savedSession] = await Promise.all([window.api.getProjects(), window.api.getWorkspace()])
        const storedProjects = rawProjects as Project[]
        const projects = storedProjects.map((project) => {
          const wasRewrite = project.projectType === 'rewrite'
          const migrateToInput = wasRewrite && project.currentStep < 3
          const migratedIdea = project.idea?.trim() ? project.idea : project.originalScript || ''
          return recoverStaleProject({
            ...createEmptyProject(project.id, project.name),
            ...project,
            projectType: 'new' as const,
            idea: migratedIdea,
            ideaInputType: project.ideaInputType === 'outline' ? 'outline' : 'idea',
            transformationLevel: project.transformationLevel || 'original' as const,
            inspirationProfile: normalizeInspirationProfile(project.inspirationProfile),
            originalityReport: project.originalityReport || null,
            currentStep: migrateToInput ? 1 : project.currentStep,
            status: migrateToInput ? 'draft' as const : project.status,
            duration: normalizeDuration(project.duration),
            enableHook: project.enableHook !== false,
            hookText: typeof project.hookText === 'string' ? project.hookText : ''
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
        const restored = restoreWorkspace(savedSession, projects)
        set({
          projects, projectsLoaded: true, saveError: null,
          latestWritingPreferences: restored.writingPreferences,
          openTabs: restored.openTabs,
          activeProjectId: restored.activeProjectId,
          currentView: restored.currentView,
          runtimes: Object.fromEntries(restored.openTabs.map((id) => [id, defaultRuntime()]))
        })
        markWorkspaceDirty()
      })().catch(() => { set({ saveError: 'Không đọc được phiên đã lưu. Hãy thử tải lại; dữ liệu cũ chưa bị thay đổi.' }) })
        .finally(() => { projectsLoading = null })
      return projectsLoading
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
    flushProjects: () => {
      if (!get().projectsLoaded) return true
      try {
        window.api.flushProjects(get().projects.filter((project) => dirtyProjects.has(project.id)), workspaceSnapshot())
        checkpointGeneration++
        dirtyProjects.clear()
        workspaceDirty = false
        set({ saveError: null })
        return true
      } catch {
        set({ saveError: 'Chưa lưu được phiên. Cửa sổ được giữ mở để bạn thử lưu lại.' })
        return false
      }
    },
    saveNow: async () => {
      if (!get().projectsLoaded) await get().loadProjects()
      return get().projectsLoaded ? flushDirtyProjects() : false
    },

    // === Project CRUD ===
    createProject: async (name) => {
      if (!get().projectsLoaded) await get().loadProjects()
      if (!get().projectsLoaded) return
      const id = uuidv4()
      const project = { ...createEmptyProject(id, name, 'new'), ...writingPreferences(get().latestWritingPreferences) }

      // CRITICAL: Flush ALL dirty in-memory projects to disk BEFORE creating new one
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
      if (!await flushDirtyProjects()) return

      // Save the new project to disk
      try { await window.api.saveProject(project) } catch {
        set({ saveError: 'Không lưu được dự án mới. Hãy thử lại; các dự án cũ được giữ nguyên.' })
        return
      }

      // Add to in-memory array (don't replace with disk response)
      set((s) => ({
        projects: [project, ...s.projects],
        openTabs: [...s.openTabs.filter((t) => t !== id), id],
        activeProjectId: id,
        currentView: 'project',
        runtimes: { ...s.runtimes, [id]: defaultRuntime() },
        isCreateDialogOpen: false
      }))
      markWorkspaceDirty()
    },

    openProject: (id) => {
      if (!get().projects.some((project) => project.id === id)) return
      set((s) => ({
        openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
        activeProjectId: id,
        currentView: 'project',
        runtimes: s.runtimes[id] ? s.runtimes : { ...s.runtimes, [id]: defaultRuntime() }
      }))
      markWorkspaceDirty()
    },

    closeTab: (id) => {
      const project = get().projects.find((p) => p.id === id)
      if (project) {
        markDirty(id)
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
      markWorkspaceDirty()
    },

    switchTab: (id) => get().openProject(id),

    deleteProject: async (id) => {
      if (deletingProjects.has(id) || !get().projects.some((p) => p.id === id)) return
      if (window.api.confirmDeleteProject && !await window.api.confirmDeleteProject(id)) return
      deletingProjects.add(id)
      abortOwner(id)
      dirtyProjects.delete(id)
      try {
        await waitOwnerIdle(id)
        if (saveInFlight) await saveInFlight
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
        markWorkspaceDirty()
        if (typeof window.api.getDeletedProjects === 'function') await get().loadStorageInfo()
      } catch {
        deletingProjects.delete(id)
        set({ saveError: 'Chưa xoá hết dữ liệu dự án. Tác vụ AI đã dừng; hãy thử xoá lại hoặc khởi động lại tool để hoàn tất.' })
      }
    },

    goToDashboard: () => { set({ currentView: 'dashboard' }); markWorkspaceDirty() },

    // === Field setters ===
    setIdea: (v) => updateProject({
      idea: v,
      inspirationProfile: null,
      originalityReport: null,
      hookText: ''
    }),
    setIdeaInputType: (v) => updateProject({ ideaInputType: v }),
    setTransformationLevel: (v) => updateProject({
      transformationLevel: v,
      originalityReport: null
    }),
    setStoryNotes: (v) => updateProject({ storyNotes: v, inspirationProfile: null, originalityReport: null }),
    setAutoFlow: (v) => updateProject({ autoFlow: v }),
    setEnableHook: (v) => updateProject({ enableHook: v, ...(v ? {} : { hookText: '' }) }),
    setStyle: (v) => updateProject({ style: v, inspirationProfile: null, originalityReport: null, hookText: '' }),
    setCustomStyle: (v) => updateProject({ customStyle: v, inspirationProfile: null, originalityReport: null, hookText: '' }),
    setLanguage: (v) => updateProject({ language: v, hookText: '' }),
    setCustomLanguage: (v) => updateProject({ customLanguage: v, hookText: '' }),
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
      if (!p) return
      updateProjectById(pid, {
        currentStep: 1, idea: '',
        inspirationProfile: null, originalityReport: null,
        storyNotes: '', ...writingPreferences(p), writingMemory: null,
        originalScript: '', scriptAnalysis: '', suggestedDirections: [], chosenDirection: '',
        questions: [], answers: {}, outlinePhase: 'idle', outline: null,
        viSummary: '', userDirection: '', generatedStory: '', hookText: '', outlineSummary: '',
        status: 'draft', projectType: 'new', preReviewStory: undefined, chapterMemories: [], storyMemory: null, chapterDocuments: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: []
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
        const isOriginalIdea = p.ideaInputType === 'idea'
        let inspirationProfile = isOriginalIdea ? null : p.inspirationProfile
        if (!isOriginalIdea && (!inspirationProfile ||
          inspirationProfile.genreCore.length === 0 ||
          inspirationProfile.storyCore.length === 0 ||
          inspirationProfile.progressionCore.length === 0 ||
          inspirationProfile.audiencePromise.length === 0)) {
          updateRuntimeFor(pid, { generationProgress: 'Đang phân tích nguồn tham khảo...' })
          addLog(pid, 'info', 'Đang phân tích nguồn tham khảo để chắt lọc điểm đặc sắc...')
          const profilePrompt = buildInspirationProfilePrompt(p.idea, p.storyNotes, p.style, p.customStyle)
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

        const isOriginalIdea = p.ideaInputType === 'idea'
        const profile = p.inspirationProfile
        if (!isOriginalIdea && !profile) throw new Error('Chưa có hồ sơ cảm hứng. Vui lòng quay lại bước 1 và tạo lại.')

        let outline: Outline | null = null
        let originalityReport: OriginalityReport | null = null
        let bestOutline: Outline | null = null
        let bestReport: OriginalityReport | null = null
        let originalityFeedback: string[] = []
        let validationFeedback = ''
        const transformationLevel = p.transformationLevel || 'original'

        for (let attempt = 1; attempt <= 3; attempt++) {
          if (isCancelled(pid)) throw new CancelledError()
          updateRuntimeFor(pid, {
            generationProgress: isOriginalIdea
              ? `Đang phát triển ý tưởng từ khái quát đến chi tiết — lần ${attempt}/3...`
              : `Đang tạo cấu trúc mới và kiểm tra độ độc lập — lần ${attempt}/3...`
          })
          addLog(
            pid,
            'info',
            isOriginalIdea ? 'Phát triển ý tưởng gốc' : `Tạo dàn ý độc lập lần ${attempt}/3`,
            isOriginalIdea
              ? `Q&A: ${qaList.length} · Không áp dụng luật biến đổi nguồn`
              : `Mức biến đổi: ${transformationLevel} · Q&A: ${qaList.length} · Dàn ý cũ dùng để tránh trùng: ${existingOutlines.length}`
          )

          try {
            const outlinePrompt = buildOutlinePrompt(
              p.idea, p.style, p.language, p.duration, qaList, existingOutlines,
              // Outline and chapter writing stay chronologically coherent; hook is edited after full story completion.
              p.customStyle, p.customLanguage, p.storyNotes, false,
              profile, transformationLevel, originalityFeedback, charsPerMinute(p.language, p.readingSpeed)
            )
            if (validationFeedback) {
              outlinePrompt.system += `\n\nThe previous attempt returned invalid output. Generate the complete outline again as one valid JSON object, without markdown or commentary. Include a non-empty title and outlineSummary, and a non-empty chapters array. Each chapter must have consecutive chapter numbers starting at 1, non-empty title and summary, and a positive numeric estimatedWords. Keep the JSON compact enough to finish within the output limit. All story text must use the requested target language.`
            }
            const outlineResp = await chat(
              [{ role: 'system', content: outlinePrompt.system }, { role: 'user', content: outlinePrompt.user }],
              { temperature: 0.4 },
              pid
            )

            if (isCancelled(pid)) throw new CancelledError()
            let candidate = parseOutlineResponse(outlineResp)

            if (hasTargetLanguageLeak(outlineLanguageText(candidate), p.language, p.customLanguage)) {
              addLog(pid, 'warn', 'Phát hiện dàn ý bị lẫn ngôn ngữ — đang tự sửa trước khi kiểm tra')
              updateRuntimeFor(pid, { generationProgress: 'Đang sửa ngôn ngữ dàn ý...' })
              const repair = buildLanguageRepairPrompt(JSON.stringify(candidate), p.language, p.customLanguage, 'outline-json')
              const repairedResp = await chat(
                [{ role: 'system', content: repair.system }, { role: 'user', content: repair.user }],
                { temperature: 0.2 },
                pid
              )
              if (isCancelled(pid)) throw new CancelledError()
              const repairedOutline = parseOutlineResponse(repairedResp)
              if (hasTargetLanguageLeak(outlineLanguageText(repairedOutline), p.language, p.customLanguage)) {
                throw new OutlineValidationError('Dàn ý vẫn bị lẫn ngôn ngữ sau khi tự sửa')
              }
              candidate = repairedOutline
              addLog(pid, 'success', 'Đã sửa ngôn ngữ dàn ý')
            }

            if (isOriginalIdea) {
              outline = candidate
              originalityReport = null
              break
            }

            const auditPrompt = buildOriginalityAuditPrompt(candidate, profile!, transformationLevel, attempt, p.style, p.customStyle)
            const auditResp = await chat(
              [{ role: 'system', content: auditPrompt.system }, { role: 'user', content: auditPrompt.user }],
              { temperature: 0.1 },
              pid
            )
            const audit = parseOriginalityReport(auditResp, attempt)
            if (isCancelled(pid)) throw new CancelledError()
            if (!audit) throw new OutlineValidationError('Bộ kiểm tra độ độc lập trả về dữ liệu không hợp lệ')
            validationFeedback = ''
            const report = normalizeOriginalityReport(audit, transformationLevel, findForbiddenFingerprints(candidate, profile!))
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

            originalityFeedback = [
              ...report.feedback,
              ...(report.missingGenreElements || []).map((item) => `Restore missing genre core: ${item}`),
              ...(report.genreDrift || []).map((item) => `Remove genre drift: ${item}`),
              ...(report.settingDrift || []).map((item) => `Restore setting and era fidelity: ${item}`)
            ]
            if (originalityFeedback.length === 0) {
              originalityFeedback = [...report.reusedFingerprints, ...report.similarPlotBeats]
            }
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
              `Dàn ý chưa đạt (${report.score}/100, thể loại ${report.genreFidelityScore ?? 0}/100) — ${attempt < 3 ? 'sẽ tạo lại' : 'đã hết 3 lần'}`,
              `Trục đã đổi: ${report.changedAxes.length} · Thiếu lõi: ${report.missingGenreElements?.join(' | ') || '(không)'} · Lệch thể loại: ${report.genreDrift?.join(' | ') || '(không)'} · Dấu vân tay: ${report.reusedFingerprints.join(' | ') || '(không rõ)'} · Gợi ý: ${originalityFeedback.join(' | ') || '(không có)'}`
            )
          } catch (err) {
            if (err instanceof CancelledError || isCancelled(pid)) throw new CancelledError()
            // Transport errors already have bounded retries in apiService; do not multiply them here.
            if (!(err instanceof OutlineValidationError)) throw err
            validationFeedback = err.message
            addLog(pid, 'warn',
              `Dữ liệu dàn ý lần ${attempt}/3 không hợp lệ${attempt < 3 ? ` — tự tạo lại lần ${attempt + 1}/3` : ' — đã hết số lần thử'}`,
              validationFeedback)
          }
        }

        if (bestReport?.settingDrift?.length) {
          addLog(
            pid,
            'error',
            'Outline rejected for world or era drift',
            `Setting fidelity: ${bestReport.settingFidelityScore ?? 0}/100 | ${bestReport.settingDrift.join(' | ')}`
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
            `Độ đúng thể loại: ${bestReport.genreFidelityScore ?? 0}/100 · Thiếu lõi: ${bestReport.missingGenreElements?.join(' | ') || '(không)'} · Lệch thể loại: ${bestReport.genreDrift?.join(' | ') || '(không)'}. Bản này vẫn an toàn về độ độc lập.`
          )
        }

        if (!outline || (!isOriginalIdea && !originalityReport?.passed && !originalityReport?.usableWithWarning)) {
          if (validationFeedback) {
            throw new Error(`Không tạo được dàn ý hợp lệ sau 3 lần. ${validationFeedback}`)
          }
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
          if (dupResult.isDuplicate) {
            addLog(pid, 'warn', 'Tự động xuyên suốt tạm dừng — phát hiện trùng cốt truyện, cần bạn xem lại')
          } else {
            if (originalityReport?.usableWithWarning) {
              addLog(pid, 'warn', 'Đã hết 3 lần — tự động dùng bản tốt nhất còn cảnh báo theo cấu hình')
            }
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
      if (p.ideaInputType !== 'idea' && p.inspirationProfile && !p.originalityReport?.passed && !p.originalityReport?.usableWithWarning) {
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
        generatedStory: '', hookText: '', preReviewStory: undefined, chapterMemories: [], storyMemory: null, chapterDocuments: [], memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], outlinePhase: 'writing', status: 'writing',
        writingEngine: 'chapter-v2', pendingChapter: null,
        writingMemory: memory
      })
      // Hạn mức ký tự tính từ thời lượng + tốc độ đọc (tự khai hoặc mặc định theo ngôn ngữ),
      // KHÔNG lấy từ estimatedWords của AI
      const chapterBudgets = chapterBudgetsFor(outline.chapters.length, targetCharsFor(p.duration, p.language, p.readingSpeed))
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
            // The hook is selected from the completed story in post-production.
            enableHook: false,
            hookChars: 0,
            customStyle: p.customStyle, customLanguage: p.customLanguage,
            inspirationProfile: p.inspirationProfile,
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
          generatedStory: fullStory.trim(), hookText: '', outlinePhase: 'writing', status: 'writing'
        })
        updateRuntimeFor(pid, { generationProgress: 'Đã viết xong và lưu memory chương.', writtenChapters: outline.chapters.length })
        addLog(pid, 'success', `Đã viết xong ${fullStory.length.toLocaleString()} ký tự và lưu memory chương`)

        await finalizeStory(pid)

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
        previousSummary = p.generatedStory ? p.generatedStory.slice(-WRITING_CONTEXT_CHARS) : null
      }

      if (startChapter >= outline.chapters.length) {
        addLog(pid, 'info', 'Tất cả chương đã hoàn thành')
        await finalizeStory(pid)
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
      const chapterBudgets = p.writingEngine === 'chapter-v2'
        ? chapterBudgetsFor(outline.chapters.length, targetCharsFor(p.duration, p.language, p.readingSpeed))
        : distributeCharBudget(outline.chapters, p.duration, p.language, p.readingSpeed)

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
            enableHook: false,
            hookChars: 0,
            customStyle: p.customStyle, customLanguage: p.customLanguage,
            inspirationProfile: p.inspirationProfile,
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
          generatedStory: fullStory.trim(), hookText: '', outlinePhase: 'writing', status: 'writing'
        })
        updateRuntimeFor(pid, {
          generationProgress: 'Đã viết xong và lưu memory chương.', writtenChapters: outline.chapters.length,
          lastFailedChapter: -1, lastFailedChunk: -1
        })
        addLog(pid, 'success', 'Đã viết xong và lưu memory các chương')

        await finalizeStory(pid)

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
        case 'generateHook': return get().regenerateHook()
        default: addLog(pid, 'warn', 'Không có hành động nào để thử lại')
      }
    },

    regenerateHook: async () => {
      const pid = get().activeProjectId
      if (!pid) return
      if (getProjectById(pid)?.status !== 'done') return
      beginTask(pid)
      await generateHookForProject(pid, true)
    },

    exportProject: async (id, format, includeHook = true) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      await window.api.exportStory(includeHook ? project : { ...project, hookText: '' }, format)
    }
  }
})
