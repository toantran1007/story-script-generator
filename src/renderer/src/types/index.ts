// ===== Core Types =====

export interface QuestionAnswer {
  question: string
  answer: string
  answeredByAI: boolean
}

export type StoryStyle =
  | 'humorous'
  | 'dramatic'
  | 'horror'
  | 'romantic'
  | 'educational'
  | 'thriller'
  | 'epic'
  | 'slice_of_life'
  | 'custom'

export type Language = 'vi' | 'en' | 'th' | 'ja' | 'ko' | 'zh' | 'custom'

export type ProjectStatus = 'draft' | 'questions' | 'outline' | 'writing' | 'done'
export type OutlinePhase = 'idle' | 'generating-outline' | 'reviewing' | 'writing' | 'done'

export interface ChapterOutline {
  chapter: number
  title: string
  summary: string
  estimatedWords: number
}

export interface Outline {
  title: string
  chapters: ChapterOutline[]
  outlineSummary: string
}

export type TransformationLevel = 'develop' | 'original' | 'reborn'
export type IdeaInputType = 'idea' | 'outline'

export interface InspirationProfile {
  sourceType: 'short-idea' | 'summary' | 'outline' | 'full-story'
  /** Genre labels found in the source, kept only when compatible with the selected style. */
  sourceGenreTags: string[]
  /** Non-negotiable genre conventions such as academy life, quests, battles, or romance beats. */
  genreCore: string[]
  /** Non-negotiable world, era, technology level and cross-world relationship from the source. */
  settingEraCore?: string[]
  /** Abstract premise and motifs to preserve without copying the source event chain. */
  storyCore: string[]
  /** The progression/reward loop the target audience expects from this kind of story. */
  progressionCore: string[]
  /** Concrete audience payoffs the new story must repeatedly deliver. */
  audiencePromise: string[]
  /** Genres or thematic directions that would displace the selected genre. */
  avoidGenreDrift: string[]
  essence: string[]
  expansionOpportunities: string[]
  requiredElements: string[]
  forbiddenNames: string[]
  forbiddenSettings: string[]
  forbiddenObjects: string[]
  forbiddenPlotBeats: string[]
  forbiddenTwists: string[]
  creativeBrief: string
}

export interface OriginalityReport {
  passed: boolean
  score: number
  attempt: number
  changedAxes: string[]
  reusedFingerprints: string[]
  similarPlotBeats: string[]
  sameTwistOrEnding: boolean
  feedback: string[]
  /** Concrete violations that must block using the outline. */
  hardViolations?: string[]
  /** Broad thematic or structural similarities shown as warnings only. */
  softSimilarities?: string[]
  plotSimilarity?: number
  /** How faithfully the outline fulfills the selected genre and compatible source DNA. */
  genreFidelityScore?: number
  /** Concrete outline evidence that the genre contract is being fulfilled. */
  genreEvidence?: string[]
  /** Required genre conventions that are absent or too weak. */
  missingGenreElements?: string[]
  /** Unselected genres or abstract themes that have displaced the intended experience. */
  genreDrift?: string[]
  /** Whether the proposed outline preserves the specified world and era boundaries. */
  settingFidelityScore?: number
  /** Concrete evidence that the proposed outline preserves the required world and era. */
  settingEvidence?: string[]
  /** Concrete world/era contradictions found by the auditor. */
  settingDrift?: string[]
  /** Near-pass candidate that is safe enough to review with a warning. */
  usableWithWarning?: boolean
}

// ===== Writing Memory (persisted) =====
export interface NarrativeState { facts: string[]; openThreads: string[] }
export type MemoryKind = 'rule' | 'requirement' | 'character' | 'object' | 'event' | 'thread' | 'fact'
export interface MemoryDelta {
  id: string; kind: MemoryKind; subject: string; text: string
  status: 'current' | 'resolved' | 'unknown'
  importance: 'core' | 'normal'; related: string[]; evidence: string
}
export interface MemoryEvidenceIssue {
  code: 'not_found' | 'ambiguous'
  recordId: string; chapter: number; chunk: number
  suppliedEvidence: string; proposedText: string; proposedStatus: MemoryDelta['status']; previousText?: string
  storyChars: number
}
export interface MemoryRecord extends Omit<MemoryDelta, 'evidence'> {
  version: number
  source: { chapter: number; chunk: number; start: number; end: number; quote: string; verified: boolean }
  verificationIssue?: MemoryEvidenceIssue
}
export interface MemoryHistoryEntry { chapter: number; chunk: number; before: MemoryRecord | null; after: MemoryRecord }
export interface MemoryPacket {
  chapter: number; chunk: number
  payload: { chapter: { summary: string; events: string[]; state: string[]; openThreads: string[] }; updates?: MemoryDelta[]; story?: NarrativeState }
}
export interface ChapterDocument { chapter: number; text: string; complete: boolean; legacyPrefixMissing?: boolean; chunks: { chunk: number; start: number; end: number }[] }
export interface ChapterMemory {
  chapter: number
  complete: boolean
  summary: string
  events: string[]
  state: string[]
  openThreads: string[]
}

export interface WritingMemory {
  completedChapters: number      // Number of fully written chapters
  currentChapter: number         // Chapter index being written (0-based)
  currentChunk: number           // Chunk index within chapter (0-based)
  chapterCharsWritten?: number   // Số ký tự đã viết trong chương hiện tại (để tính hạn mức khi viết tiếp)
  totalChapters: number          // Total chapters in outline
  lastContext: string            // Short prose tail; chapter/global memory carries narrative state
  startedAt: string              // When writing started
  lastWriteAt: string            // When last chunk was written
}

// ===== Project — Full wizard state snapshot =====

export type ProjectType = 'new' | 'rewrite'

export interface Project {
  writingEngine?: 'chapter-v2'
  pendingChapter?: { chapterIndex: number; text: string; truncated?: boolean } | null
  id: string
  name: string
  projectType: ProjectType
  status: ProjectStatus
  createdAt: string
  updatedAt: string

  // Step 1
  idea: string
  ideaInputType: IdeaInputType
  transformationLevel: TransformationLevel
  inspirationProfile: InspirationProfile | null
  originalityReport: OriginalityReport | null
  /** Ghi chú / lưu ý của tác giả — AI phải tuân theo ở mọi bước (câu hỏi, dàn ý, viết) */
  storyNotes: string
  style: StoryStyle
  customStyle: string
  language: Language
  customLanguage: string
  duration: number
  /** Bật hook hậu kỳ: chọn cảnh ấn tượng từ full truyện sau khi viết xong. */
  enableHook: boolean
  /** Tốc độ đọc tự khai (ký tự/phút). 0 = dùng mặc định theo ngôn ngữ. */
  readingSpeed: number
  mode: 'guided' | 'auto'
  /** Tự động xuyên suốt: viết ngay sau khi có dàn ý, không dừng ở bước xem trước */
  autoFlow: boolean
  currentStep: 1 | 2 | 3

  // Rewrite mode
  originalScript: string
  scriptAnalysis: string
  suggestedDirections: string[]
  chosenDirection: string

  // Step 2
  questions: string[]
  answers: Record<number, string>

  // Step 3 — outline
  outlinePhase: OutlinePhase
  outline: Outline | null
  viSummary: string
  userDirection: string

  // Step 3 — story
  generatedStory: string
  /** Hook được biên tập từ một cảnh thật trong full truyện sau khi hoàn tất. */
  hookText: string
  chapterMemories?: ChapterMemory[]
  storyMemory?: NarrativeState | null
  memoryRecords?: MemoryRecord[]
  memoryHistory?: MemoryHistoryEntry[]
  memoryPackets?: MemoryPacket[]
  memoryIssues?: MemoryEvidenceIssue[]
  chapterDocuments?: ChapterDocument[]
  storageEpoch?: number
  /** Preserves the pre-edit draft when consistency corrections are accepted. */
  preReviewStory?: string
  outlineSummary: string

  // Writing progress (persisted for resume)
  writingMemory: WritingMemory | null
}

export function createEmptyProject(id: string, name: string, projectType: ProjectType = 'new'): Project {
  return {
    id,
    name,
    projectType,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    idea: '',
    ideaInputType: 'idea',
    transformationLevel: 'original',
    inspirationProfile: null,
    originalityReport: null,
    storyNotes: '',
    style: 'dramatic',
    customStyle: '',
    language: 'vi',
    customLanguage: '',
    duration: 30,
    enableHook: true,
    readingSpeed: 0,
    mode: 'auto',
    autoFlow: false,
    currentStep: 1,
    originalScript: '',
    scriptAnalysis: '',
    suggestedDirections: [],
    chosenDirection: '',
    questions: [],
    answers: {},
    outlinePhase: 'idle',
    outline: null,
    viSummary: '',
    userDirection: '',
    generatedStory: '',
    hookText: '',
    outlineSummary: '',
    writingMemory: null,
    chapterMemories: [], storyMemory: null,
    memoryRecords: [], memoryHistory: [], memoryPackets: [], memoryIssues: [], chapterDocuments: []
  }
}

// ===== Legacy (kept for export compat) =====

export interface StoryData {
  id: string
  title: string
  idea: string
  style: StoryStyle
  language: Language
  duration: number
  content: string
  outlineSummary: string
  createdAt: string
  questions?: QuestionAnswer[]
}

// ===== Settings =====

export interface AppSettings {
  apiProvider: ApiProviderId
  apiProfiles: ApiProfiles
  apiBaseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
}

export type ApiProviderId = 'legacy' | 'vilao' | 'custom'

export interface ApiProviderProfile {
  apiBaseUrl: string
  apiKey: string
  model: string
}

export type ApiProfiles = Record<ApiProviderId, ApiProviderProfile>

export interface AppInfo {
  version: string
  isPackaged: boolean
  isPortable: boolean
  updateSupported: boolean
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'unsupported'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  version?: string
  progress?: number
  message?: string
}

export const VILAO_API_PRESET = {
  apiBaseUrl: 'https://api.vilao.ai/v1',
  model: 'cd/gpt-5.6-sol'
} as const

export function normalizeVilaoModelId(model?: string): string {
  const value = (model || '').trim()
  if (!value || value.includes('/')) return value
  const aliases: Record<string, string> = {
    'gemini-3.7-flash-high': 'anxs/gemini-3.7-flash-high',
    'gpt-5.6-sol': 'cd/gpt-5.6-sol'
  }
  return aliases[value] || value
}

/** Recover persisted wizard snapshots left mid-generation after an app restart. */
export function recoverStaleProject(project: Project): Project {
  const { qualityReviewState, ...persisted } = project as Project & { qualityReviewState?: string }
  project = persisted
  if ((qualityReviewState === 'pending' || qualityReviewState === 'failed') && project.generatedStory.trim()) {
    return { ...project, status: 'done', outlinePhase: 'done', writingMemory: null }
  }
  const hasStory = project.generatedStory.trim().length > 0
  const hasOutline = Boolean(project.outline)
  const staleOutlineState = project.currentStep === 3 && !hasOutline && !hasStory &&
    (project.outlinePhase === 'idle' || project.outlinePhase === 'generating-outline' || project.status === 'outline')
  if (!staleOutlineState) return project

  const hasQuestions = project.questions.length > 0
  return {
    ...project,
    currentStep: hasQuestions ? 2 : 1,
    status: hasQuestions ? 'questions' : 'draft',
    outlinePhase: 'idle'
  }
}

export const LEGACY_API_PRESET = {
  apiBaseUrl: 'http://localhost:64072/v1',
  model: 'gpt-6-astra'
} as const

const DEPRECATED_LEGACY_API_BASE_URL = 'https://rzlbnr4.abc-tunnel.us/v1'

export const API_PROVIDER_INFO: Record<
  ApiProviderId,
  { name: string; description: string }
> = {
  legacy: { name: 'Cookpit', description: 'Responses API · localhost:64072 · gpt-6-astra' },
  vilao: { name: 'Vilao AI', description: `OpenAI-compatible · ${VILAO_API_PRESET.model}` },
  custom: { name: 'Tùy chỉnh', description: 'Endpoint OpenAI-compatible khác' }
}

function createDefaultApiProfiles(): ApiProfiles {
  return {
    legacy: { ...LEGACY_API_PRESET, apiKey: '' },
    vilao: { ...VILAO_API_PRESET, apiKey: '' },
    custom: { apiBaseUrl: '', apiKey: '', model: '' }
  }
}

function detectApiProvider(apiBaseUrl?: string): ApiProviderId {
  const normalized = (apiBaseUrl || '').trim().replace(/\/+$/, '')
  if (normalized === VILAO_API_PRESET.apiBaseUrl) return 'vilao'
  if (
    normalized === LEGACY_API_PRESET.apiBaseUrl ||
    normalized === DEPRECATED_LEGACY_API_BASE_URL
  ) return 'legacy'
  return 'custom'
}

function migrateLegacyApiBaseUrl(apiBaseUrl?: string): string | undefined {
  const normalized = apiBaseUrl?.trim().replace(/\/+$/, '')
  return normalized === DEPRECATED_LEGACY_API_BASE_URL
    ? LEGACY_API_PRESET.apiBaseUrl
    : apiBaseUrl
}

function isApiProvider(value: unknown): value is ApiProviderId {
  return value === 'legacy' || value === 'vilao' || value === 'custom'
}

export function normalizeSettings(input?: Partial<AppSettings>): AppSettings {
  const source = input || {}
  // Retain the internal profile key for saved sessions, not the removed router credentials.
  const oldRouter = (url?: string): boolean => /localhost:20128|127\.0\.0\.1:20128|rzlbnr4\.abc-tunnel\.us/.test(url || '')
  if (source.apiProvider === 'legacy' && oldRouter(source.apiBaseUrl)) {
    return normalizeSettings({ ...source, ...LEGACY_API_PRESET, apiKey: '',
      apiProfiles: source.apiProfiles ? { ...source.apiProfiles, legacy: { ...LEGACY_API_PRESET, apiKey: '' } } : undefined })
  }
  const sourceApiBaseUrl = migrateLegacyApiBaseUrl(source.apiBaseUrl)
  const provider = isApiProvider(source.apiProvider)
    ? source.apiProvider
    : detectApiProvider(sourceApiBaseUrl)
  const defaults = createDefaultApiProfiles()
  const profiles: ApiProfiles = {
    legacy: {
      ...defaults.legacy,
      ...(oldRouter(source.apiProfiles?.legacy?.apiBaseUrl) ? {} : source.apiProfiles?.legacy),
      apiBaseUrl: (oldRouter(source.apiProfiles?.legacy?.apiBaseUrl) ? undefined : source.apiProfiles?.legacy?.apiBaseUrl) ??
        defaults.legacy.apiBaseUrl
    },
    vilao: {
      ...defaults.vilao,
      ...source.apiProfiles?.vilao,
      model: normalizeVilaoModelId(source.apiProfiles?.vilao?.model ?? defaults.vilao.model)
    },
    custom: { ...defaults.custom, ...source.apiProfiles?.custom }
  }

  if (sourceApiBaseUrl !== undefined || source.apiKey !== undefined || source.model !== undefined) {
    profiles[provider] = {
      apiBaseUrl: sourceApiBaseUrl ?? profiles[provider].apiBaseUrl,
      apiKey: source.apiKey ?? profiles[provider].apiKey,
      model: provider === 'vilao'
        ? normalizeVilaoModelId(source.model ?? profiles[provider].model)
        : source.model ?? profiles[provider].model
    }
  }

  const active = profiles[provider]
  return {
    apiProvider: provider,
    apiProfiles: profiles,
    ...active,
    maxTokens: source.maxTokens ?? 16384,
    temperature: source.temperature ?? 0.8
  }
}

export function activateApiProvider(
  settings: AppSettings,
  provider: ApiProviderId
): AppSettings {
  const current = normalizeSettings(settings)
  const apiProfiles: ApiProfiles = {
    ...current.apiProfiles,
    [current.apiProvider]: {
      apiBaseUrl: current.apiBaseUrl,
      apiKey: current.apiKey,
      model: current.model
    }
  }
  return normalizeSettings({ ...current, apiProvider: provider, apiProfiles, ...apiProfiles[provider] })
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface DuplicateResult {
  isDuplicate: boolean
  maxSimilarity: number
  similarTo?: string
}

// ===== Labels =====

export const STYLE_LABELS: Record<StoryStyle, Record<string, string>> = {
  humorous: { vi: 'Hài hước', en: 'Humorous' },
  dramatic: { vi: 'Kịch tính', en: 'Dramatic' },
  horror: { vi: 'Kinh dị', en: 'Horror' },
  romantic: { vi: 'Tình cảm', en: 'Romantic' },
  educational: { vi: 'Giáo dục', en: 'Educational' },
  thriller: { vi: 'Hồi hộp', en: 'Thriller' },
  epic: { vi: 'Sử thi', en: 'Epic' },
  slice_of_life: { vi: 'Đời thường', en: 'Slice of Life' },
  custom: { vi: 'Tùy chỉnh', en: 'Custom' }
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  th: 'ภาษาไทย',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  custom: 'Khác'
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Nháp',
  questions: 'Câu hỏi',
  outline: 'Dàn ý',
  writing: 'Đang viết',
  done: 'Hoàn thành'
}

export const DEFAULT_SETTINGS: AppSettings = normalizeSettings({
  apiProvider: 'legacy',
  apiBaseUrl: LEGACY_API_PRESET.apiBaseUrl,
  apiKey: '',
  model: LEGACY_API_PRESET.model,
  maxTokens: 16384,
  temperature: 0.8
})
