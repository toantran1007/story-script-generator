import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'
import { countText, readingMinutes, targetCharsFor, distributeCharBudget } from '@/services/textMetrics'
import type { LogEntry } from '@/stores/storyStore'
import { useRef, useEffect, type JSX } from 'react'

function LogPanel({ logs }: { logs: LogEntry[] }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  if (logs.length === 0) return <div />

  const levelIcon = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info': return 'ℹ️'
      case 'warn': return '⚠️'
      case 'error': return '❌'
      case 'success': return '✅'
    }
  }

  const levelClass = (level: LogEntry['level']): string => `log-entry log-entry--${level}`

  return (
    <div className="log-panel">
      <div className="log-panel__header">
        <span>📋 Nhật ký tiến trình</span>
        <span className="log-panel__count">{logs.length}</span>
      </div>
      <div className="log-panel__body" ref={scrollRef}>
        {logs.map((log, i) => (
          <div key={i} className={levelClass(log.level)}>
            <span className="log-entry__icon">{levelIcon(log.level)}</span>
            <span className="log-entry__time">{log.time}</span>
            <span className="log-entry__msg">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OutlineReview(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const {
    setUserDirection, confirmAndWrite, regenerateOutline,
    clearError, setStep, retryLastAction
  } = useAppStore()

  if (!p || !p.outline) return <div />

  // Hạn mức thật khi viết: suy từ thời lượng + tốc độ đọc, không phải estimatedWords của AI
  const budgets = distributeCharBudget(p.outline.chapters, p.duration, p.language, p.readingSpeed)
  const totalChars = targetCharsFor(p.duration, p.language, p.readingSpeed)

  return (
    <div className="wizard" style={{ maxWidth: 800 }}>
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">3</div>
        </div>
        <h1 className="wizard__title">Xem trước cốt truyện</h1>
        <p className="wizard__subtitle">
          Đọc tóm tắt bên dưới rồi xác nhận hoặc chỉnh sửa hướng đi trước khi viết
        </p>
      </div>

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <div className="error-banner__actions">
            <button className="btn btn--sm btn--primary" onClick={retryLastAction}>🔄 Thử lại</button>
            <button className="error-banner__close" onClick={clearError}>✕</button>
          </div>
        </div>
      )}

      {runtime.duplicateResult?.isDuplicate && (
        <div className="duplicate-warning">
          ⚠ Phát hiện trùng cốt truyện: {Math.round(runtime.duplicateResult.maxSimilarity * 100)}% giống với &quot;{runtime.duplicateResult.similarTo}&quot;
          <button className="btn btn--sm btn--secondary" onClick={regenerateOutline}>
            Tạo lại dàn ý
          </button>
        </div>
      )}

      <div className="outline-header">
        <h2 className="outline-header__title">{p.outline.title}</h2>
        <div className="outline-header__meta">
          <span>📖 {p.outline.chapters.length} chương</span>
          <span>📝 ~{totalChars.toLocaleString()} ký tự</span>
          <span>⏱ ~{p.duration} phút đọc</span>
        </div>
      </div>

      <div className="outline-summary">
        <div className="outline-summary__label">📋 Tóm tắt cốt truyện (tiếng Việt)</div>
        <div className="outline-summary__content">{p.viSummary}</div>
      </div>

      <div className="outline-chapters">
        <div className="outline-chapters__label">📑 Danh sách chương</div>
        {p.outline.chapters.map((ch, idx) => (
          <div key={ch.chapter} className="outline-chapter">
            <div className="outline-chapter__header">
              <span className="outline-chapter__number">Chương {ch.chapter}</span>
              <span className="outline-chapter__words">~{(budgets[idx] ?? 0).toLocaleString()} ký tự</span>
            </div>
            <div className="outline-chapter__title">{ch.title}</div>
            <div className="outline-chapter__summary">{ch.summary}</div>
          </div>
        ))}
      </div>

      <div className="outline-direction">
        <label className="form-label">✏️ Ghi chú / chỉnh hướng đi (tùy chọn)</label>
        <textarea
          className="form-textarea"
          placeholder="VD: Muốn kết thúc buồn hơn, thêm twist ở chương 3, nhân vật phụ cần nổi bật hơn..."
          value={p.userDirection}
          onChange={(e) => setUserDirection(e.target.value)}
          rows={3}
        />
        <div className="outline-direction__hint">
          Để trống nếu hài lòng với cốt truyện. AI sẽ tham khảo ghi chú này khi viết.
        </div>
      </div>

      <LogPanel logs={runtime.logs} />

      <div className="btn-group" style={{ marginTop: 24 }}>
        <button className="btn btn--secondary" onClick={() => setStep(2)}>← Quay lại</button>
        <button className="btn btn--secondary" onClick={regenerateOutline} disabled={runtime.isGenerating}>
          🔄 Tạo lại dàn ý
        </button>
        <button className="btn btn--primary" onClick={() => confirmAndWrite()} disabled={runtime.isGenerating}>
          {runtime.isGenerating ? (
            <><span className="story-output__spinner" />{runtime.generationProgress || 'Đang xử lý...'}</>
          ) : (
            '✅ Xác nhận & Bắt đầu viết →'
          )}
        </button>
        <StopButton full />
      </div>
    </div>
  )
}

function GeneratingOutline(): JSX.Element {
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { retryLastAction, clearError } = useAppStore()

  return (
    <div className="wizard">
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">3</div>
        </div>
        <h1 className="wizard__title">Đang xây dựng cốt truyện...</h1>
        <p className="wizard__subtitle">{runtime.generationProgress || 'AI đang suy nghĩ...'}</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StopButton />
      </div>

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <div className="error-banner__actions">
            <button className="btn btn--sm btn--primary" onClick={retryLastAction}>🔄 Thử lại</button>
            <button className="error-banner__close" onClick={clearError}>✕</button>
          </div>
        </div>
      )}

      <LogPanel logs={runtime.logs} />

      {!runtime.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="loading-skeleton" style={{ height: 120, width: '100%' }} />
          <div className="loading-skeleton" style={{ height: 200, width: '100%' }} />
          <div className="loading-skeleton" style={{ height: 80, width: '100%' }} />
        </div>
      )}
    </div>
  )
}

function StoryOutput(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { exportProject, resetWizard, clearError, regenerateOutline, continueWriting, retryLastAction } = useAppStore()

  if (!p) return <div />

  const displayText = runtime.isGenerating ? runtime.streamingText : p.generatedStory
  const { value: wordCount, unit } = countText(displayText, p.language)
  const readMinutes = readingMinutes(displayText, p.language, p.readingSpeed)
  const targetChars = targetCharsFor(p.duration, p.language, p.readingSpeed)

  const handleExport = async (format: string): Promise<void> => {
    await exportProject(p.id, format)
  }

  const handleCopy = (): void => {
    navigator.clipboard.writeText(p.generatedStory)
  }

  const hasFailed = !!runtime.error && !runtime.isGenerating

  return (
    <div className="story-output">
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">3</div>
        </div>
        <h1 className="wizard__title">
          {p.outline?.title || 'Câu chuyện của bạn'}
        </h1>
        {p.outline && (
          <p className="wizard__subtitle">
            {p.outline.chapters.length} chương · {wordCount > 0 ? `${wordCount.toLocaleString()} ${unit}` : 'đang viết...'}
            {runtime.isGenerating && runtime.writtenChapters > 0 && (
              <> · Chương {runtime.writtenChapters + 1}/{runtime.totalChapters}</>
            )}
          </p>
        )}
      </div>

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <div className="error-banner__actions">
            <button className="btn btn--sm btn--primary" onClick={continueWriting}>▶ Tiếp tục</button>
            <button className="btn btn--sm btn--secondary" onClick={retryLastAction}>🔄 Thử lại</button>
            <button className="error-banner__close" onClick={clearError}>✕</button>
          </div>
        </div>
      )}

      {/* Resume banner — project was interrupted (app closed/crashed) */}
      {!runtime.isGenerating && !runtime.error && p.writingMemory && p.status === 'writing' && (
        <div className="resume-banner">
          <div className="resume-banner__info">
            <span className="resume-banner__icon">⚡</span>
            <div>
              <div className="resume-banner__title">Dự án viết dở</div>
              <div className="resume-banner__detail">
                Đã viết {p.writingMemory.completedChapters}/{p.writingMemory.totalChapters} chương
                {p.writingMemory.lastWriteAt && ` · Lần cuối: ${new Date(p.writingMemory.lastWriteAt).toLocaleString('vi-VN')}`}
              </div>
            </div>
          </div>
          <button className="btn btn--primary" onClick={continueWriting}>
            ▶ Viết tiếp
          </button>
        </div>
      )}

      {runtime.isGenerating && (
        <div className="story-output__progress">
          <span className="story-output__spinner" />
          <span style={{ flex: 1 }}>{runtime.generationProgress}</span>
          <StopButton />
        </div>
      )}

      {/* Progress bar */}
      {(runtime.isGenerating || hasFailed) && runtime.totalChapters > 0 && (
        <div className="writing-progress">
          <div className="writing-progress__bar">
            <div
              className="writing-progress__fill"
              style={{ width: `${(runtime.writtenChapters / runtime.totalChapters) * 100}%` }}
            />
          </div>
          <span className="writing-progress__label">
            {runtime.writtenChapters}/{runtime.totalChapters} chương
          </span>
        </div>
      )}

      <div className="story-output__content">
        {displayText || (
          <div className="empty-state">
            <div className="empty-state__icon">✨</div>
            <div className="empty-state__title">Truyện sẽ hiển thị ở đây</div>
            <div className="empty-state__text">Đang chờ bắt đầu viết...</div>
          </div>
        )}
      </div>

      {wordCount > 0 && (
        <div className="story-output__stats">
          <span>📝 {wordCount.toLocaleString()} {unit}</span>
          <span>⏱ ~{readMinutes} phút đọc</span>
          <span>🎯 hạn mức {targetChars.toLocaleString()} ký tự / {p.duration} phút</span>
          {p.outline && <span>📖 {p.outline.chapters.length} chương</span>}
        </div>
      )}

      <LogPanel logs={runtime.logs} />

      <div className="story-output__actions">
        {hasFailed && (
          <>
            <button className="btn btn--primary" onClick={continueWriting}>▶ Tiếp tục viết</button>
            <button className="btn btn--secondary" onClick={retryLastAction}>🔄 Thử lại chương lỗi</button>
          </>
        )}
        {!runtime.isGenerating && p.generatedStory && !hasFailed && (
          <>
            <button className="btn btn--secondary" onClick={handleCopy}>📋 Sao chép</button>
            <button className="btn btn--secondary" onClick={() => handleExport('md')}>📄 Xuất .md</button>
            <button className="btn btn--secondary" onClick={() => handleExport('txt')}>📄 Xuất .txt</button>
            <button className="btn btn--secondary" onClick={regenerateOutline}>🔄 Tạo lại từ đầu</button>
            <button className="btn btn--ghost" onClick={resetWizard}>+ Truyện mới</button>
          </>
        )}
      </div>
    </div>
  )
}

export function WizardStep3(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  if (!p) return <div />

  switch (p.outlinePhase) {
    case 'generating-outline':
      return <GeneratingOutline />
    case 'reviewing':
      return <OutlineReview />
    case 'writing':
    case 'done':
      return <StoryOutput />
    default:
      return <StoryOutput />
  }
}
