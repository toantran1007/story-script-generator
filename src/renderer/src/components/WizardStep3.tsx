import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'
import { LogPanel } from '@/components/LogPanel'
import { countText, readingMinutes, targetCharsFor, distributeCharBudget } from '@/services/textMetrics'
import type { JSX } from 'react'

function OutlineReview(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const {
    setUserDirection, confirmAndWrite, regenerateOutline, retryOutlineStronger,
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

      {(p.originalityReport?.passed || p.originalityReport?.usableWithWarning) && (
        <div className={`originality-report ${p.originalityReport?.usableWithWarning ? 'originality-report--warning' : ''}`}>
          <div className="originality-report__header">
            <span>{p.originalityReport?.usableWithWarning ? '⚠ Bản tốt nhất dùng được với cảnh báo' : '✅ Dàn ý đã vượt kiểm định độc lập'}</span>
            <span className="originality-report__score">{p.originalityReport.score}/100</span>
          </div>
          <div className="originality-report__section">
            Đã thay đổi {p.originalityReport.changedAxes.length}/10 trục cốt truyện. Nguồn chỉ được dùng để học điểm đặc sắc trừu tượng, không dùng lại tên riêng, bối cảnh hay chuỗi tình huống.
          </div>
          {p.inspirationProfile && (
            <div className="originality-report__section">
              <strong>Đã học hỏi:</strong> {p.inspirationProfile.essence.slice(0, 4).join(' · ') || 'Chủ đề và sức hấp dẫn cốt lõi'}
            </div>
          )}
          <div className="originality-report__section">
            <strong>Đã thay đổi:</strong> {p.originalityReport.changedAxes.join(' · ')}
          </div>
          <div className="originality-report__section">
            <strong>Độ trung thành thể loại:</strong> {p.originalityReport.genreFidelityScore ?? '—'}/100
            {p.originalityReport.genreEvidence?.length ? ` · ${p.originalityReport.genreEvidence.slice(0, 3).join(' · ')}` : ''}
          </div>
          <div className="originality-report__section">
            <strong>Setting and era fidelity:</strong> {p.originalityReport.settingFidelityScore ?? '—'}/100
            {p.originalityReport.settingEvidence?.length ? ` · ${p.originalityReport.settingEvidence.slice(0, 2).join(' · ')}` : ''}
          </div>
          {!!p.originalityReport.settingDrift?.length && (
            <div className="originality-report__section originality-report__section--warning">
              <strong>Setting or era drift:</strong> {p.originalityReport.settingDrift.join(' · ')}
            </div>
          )}
          {!!p.originalityReport.missingGenreElements?.length && (
            <div className="originality-report__section originality-report__section--warning">
              <strong>Thiếu lõi thể loại:</strong> {p.originalityReport.missingGenreElements.join(' · ')}
            </div>
          )}
          {!!p.originalityReport.genreDrift?.length && (
            <div className="originality-report__section originality-report__section--warning">
              <strong>Lệch sang thể loại khác:</strong> {p.originalityReport.genreDrift.join(' · ')}
            </div>
          )}
          {!!p.originalityReport.softSimilarities?.length && (
            <div className="originality-report__section">
              <strong>Tương đồng cần lưu ý:</strong> {p.originalityReport.softSimilarities.join(' · ')}
            </div>
          )}
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
        <button
          className="btn btn--primary"
          onClick={() => confirmAndWrite()}
          disabled={runtime.isGenerating || (!!p.inspirationProfile && !p.originalityReport?.passed && !p.originalityReport?.usableWithWarning)}
        >
          {runtime.isGenerating ? (
            <><span className="story-output__spinner" />{runtime.generationProgress || 'Đang xử lý...'}</>
          ) : (
            p.originalityReport?.usableWithWarning
              ? 'Dùng bản tốt nhất & Bắt đầu viết →'
              : '✅ Xác nhận & Bắt đầu viết →'
          )}
        </button>
        <StopButton full />
      </div>
    </div>
  )
}

function GeneratingOutline(): JSX.Element {
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { retryLastAction, retryOutlineStronger, clearError, setStep } = useAppStore()

  return (
    <div className="wizard wizard--generating">
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">3</div>
        </div>
        <h1 className="wizard__title">{runtime.error ? 'Chưa tạo được dàn ý' : 'Đang xây dựng cốt truyện...'}</h1>
        <p className="wizard__subtitle">
          {runtime.error ? 'Bạn có thể thử lại, tăng mức biến đổi hoặc quay lại chỉnh nguồn.' : runtime.generationProgress || 'AI đang suy nghĩ...'}
        </p>
      </div>

      {runtime.isGenerating && (
        <div style={{ marginBottom: 16 }}>
          <StopButton />
        </div>
      )}

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <div className="error-banner__actions">
            <button className="btn btn--sm btn--primary" onClick={retryLastAction}>🔄 Thử lại</button>
            <button className="btn btn--sm btn--secondary" onClick={retryOutlineStronger}>↗ Biến đổi mạnh hơn</button>
            <button className="btn btn--sm btn--secondary" onClick={() => setStep(1)}>← Chỉnh nguồn</button>
            <button className="error-banner__close" onClick={clearError}>✕</button>
          </div>
        </div>
      )}

      <LogPanel logs={runtime.logs} />

      {!runtime.error && (
        <div className="wizard__loading-grid" aria-label="Đang chuẩn bị nội dung">
          <div className="loading-skeleton" />
          <div className="loading-skeleton" />
          <div className="loading-skeleton" />
        </div>
      )}
    </div>
  )
}

function StoryOutput(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { exportProject, resetWizard, clearError, regenerateOutline, continueWriting, retryLastAction, retryOutlineStronger, regenerateHook, setStep } = useAppStore()

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
  const hookFailed = hasFailed && runtime.lastAction === 'generateHook'

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
            {hookFailed ? (
              <button className="btn btn--sm btn--primary" onClick={regenerateHook}>🪝 Thử lại hook</button>
            ) : !p.outline ? (
              <>
                <button className="btn btn--sm btn--primary" onClick={retryLastAction}>🔄 Thử lại</button>
                <button className="btn btn--sm btn--secondary" onClick={retryOutlineStronger}>↗ Biến đổi mạnh hơn</button>
                <button className="btn btn--sm btn--secondary" onClick={() => setStep(1)}>← Chỉnh nguồn</button>
              </>
            ) : (
              <>
                <button className="btn btn--sm btn--primary" onClick={continueWriting}>▶ Tiếp tục</button>
                <button className="btn btn--sm btn--secondary" onClick={retryLastAction}>🔄 Thử lại</button>
              </>
            )}
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

      {p.hookText && (
        <section className="story-output__hook" aria-label="Hook mở đầu">
          <div className="story-output__hook-title">🪝 Hook mở đầu từ cảnh nổi bật</div>
          <div className="story-output__hook-text">{p.hookText}</div>
        </section>
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
        {hasFailed && !hookFailed && (
          <>
            <button className="btn btn--primary" onClick={continueWriting}>▶ Tiếp tục viết</button>
            <button className="btn btn--secondary" onClick={retryLastAction}>🔄 Thử lại chương lỗi</button>
          </>
        )}
        {!runtime.isGenerating && p.generatedStory && !hasFailed && (
          <>
            {p.enableHook !== false && <button className="btn btn--secondary" onClick={regenerateHook}>🪝 Tạo lại hook</button>}
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
