import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'
import { LogPanel } from '@/components/LogPanel'
import { countText, readingMinutes, targetCharsFor, chapterBudgetsFor, durationAssessment } from '@/services/textMetrics'
import type { JSX } from 'react'
import { formatSentenceLines, formatStoryWithHook } from '@shared/storyFormatting'
import { estimateWrittenDuration, roundedMinutes } from '@shared/narrationDuration'

function OutlineReview(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const {
    setUserDirection, confirmAndWrite, regenerateOutline, retryOutlineStronger,
    clearError, setStep, retryLastAction
  } = useAppStore()

  if (!p || !p.outline) return <div />

  // Hạn mức thật khi viết: suy từ thời lượng + tốc độ đọc, không phải estimatedWords của AI
  const budgets = p.longStory?.plan.chapters.map(ch => ch.targetCharacters) || chapterBudgetsFor(p.outline.chapters.length, targetCharsFor(p.duration, p.language, p.readingSpeed))
  const totalChars = p.longStory?.plan.duration.targetCharacters || targetCharsFor(p.duration, p.language, p.readingSpeed)

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
          <span>⏱ {p.duration} phút mục tiêu{p.longStory ? ' · kế hoạch ước tính AI' : ''}</span>
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

  const proseReady = p.status === 'done' && !p.writingMemory && !!p.generatedStory.trim()
  const displayText = runtime.isGenerating && !proseReady ? runtime.streamingText : formatSentenceLines(p.generatedStory, p.language)
  const displayedHook = formatSentenceLines(p.hookText, p.language)
  const bodyText = !runtime.isGenerating && displayedHook && displayText.startsWith(displayedHook)
    ? displayText.slice(displayedHook.length).trimStart() : displayText
  const measurementText = runtime.isGenerating && !proseReady ? runtime.streamingText : p.generatedStory
  const { value: wordCount, unit } = countText(measurementText, p.language)
  const timing = estimateWrittenDuration(p, measurementText)
  const readMinutes = timing.minutes !== null ? roundedMinutes(timing.minutes) : p.longStory ? null : readingMinutes(measurementText, p.language, p.readingSpeed)
  const duration = durationAssessment(measurementText, p.duration, p.language, p.readingSpeed)
  const targetChars = p.longStory?.plan.duration.targetCharacters || targetCharsFor(p.duration, p.language, p.readingSpeed)

  const handleExport = async (format: string, includeHook = true): Promise<void> => {
    await exportProject(p.id, format, includeHook)
  }

  const handleCopy = (): void => {
    const completeStory = formatStoryWithHook(p.generatedStory, p.hookText, p.language)
    navigator.clipboard.writeText(completeStory)
  }

  const hasFailed = !!(runtime.error || p.durationIssue || p.longStory?.error) && !runtime.isGenerating
  const hookFailed = hasFailed && runtime.lastAction === 'generateHook'
  const unverifiedMemoryCount = (p.memoryRecords || []).filter((record) => record.verificationIssue && !record.source.verified).length

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
            {runtime.isGenerating && !proseReady && runtime.writtenChapters > 0 && (
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
          <div className="story-output__hook-title">🪝 Hook biên soạn từ cảnh nổi bật · khoảng 1–2 phút</div>
          <div className="story-output__hook-text">{displayedHook}</div>
        </section>
      )}

      <div className="story-output__content">
        {bodyText || (!p.hookText && (
          <div className="empty-state">
            <div className="empty-state__icon">✨</div>
            <div className="empty-state__title">Truyện sẽ hiển thị ở đây</div>
            <div className="empty-state__text">Đang chờ bắt đầu viết...</div>
          </div>
        ))}
      </div>

      {p.pendingChapter && !runtime.isGenerating && <div className="resume-banner" role="status">
        {p.pendingChapter.lastError && <div role="alert" style={{ color: 'var(--error)' }}>Lỗi lần trước: {p.pendingChapter.lastError}</div>}
        Đã lưu bản nháp chương {p.pendingChapter.chapterIndex + 1} ({p.pendingChapter.text.length.toLocaleString()} ký tự), {p.pendingChapter.truncated ? 'chờ viết nối phần bị API cắt dở' : 'chờ kiểm tra độ dài/sửa cục bộ/memory'}. Nhấn Tiếp tục để xử lý bản nháp; không viết lại chương đã hoàn thành. Nếu độ dài chưa đạt, chỉ biên tập các cảnh đã có, không thêm tình tiết mới.
        {p.pendingChapter.originalText && <details><summary>Bản nháp gốc trước khi chỉnh độ dài</summary><div style={{ whiteSpace: 'pre-wrap' }}>{p.pendingChapter.originalText}</div></details>}
      </div>}
      {p.durationIssue && !runtime.isGenerating && <div role="alert" style={{ color: 'var(--error)' }}>{p.durationIssue}</div>}
      {p.longStory?.error && !p.pendingChapter && !runtime.isGenerating && <div role="alert" style={{ color: 'var(--error)' }}>{p.longStory.error}</div>}
      {!!p.longStory?.recoveryHistory?.length && <details className="resume-banner">
        <summary>Lịch sử tự phục hồi ({p.longStory.recoveryHistory.length} lỗi gần nhất)</summary>
        {p.longStory.recoveryHistory.slice(-10).map((entry, i) => <div key={`${entry.time}-${i}`}>
          Chương {entry.chapter} · {entry.stage} · vòng {entry.round}/3, lượt {entry.attempt}/3 · {entry.message}
          {entry.model ? ` · model dự phòng: ${entry.model}` : ''}{entry.delayMs ? ` · chờ ${entry.delayMs / 1000}s` : ''}
        </div>)}
      </details>}

      {wordCount > 0 && (
        <div className="story-output__stats">
          <span>📝 {wordCount.toLocaleString()} {unit}</span>
          <span>⏱ {readMinutes === null ? 'Chưa có ước tính cho phần đang viết' : `Ước tính từ bản đã viết: ~${readMinutes} phút`} · chưa đo TTS</span>
          {timing.source === 'ai-plan-ratio' && <span>Ước tính theo tỷ lệ độ dài/kế hoạch AI đã duyệt, chưa có mốc TTS riêng cho ngôn ngữ này.</span>}
          <span>Yêu cầu: {p.duration} phút</span>
          {p.longStory && <span>Kế hoạch ban đầu (ước tính bởi AI): {p.longStory.plan.duration.estimatedMinutes} phút</span>}
          <span>{duration.chars.toLocaleString()} ký tự tính thời lượng (bỏ khoảng trắng định dạng)</span>
          <span>🎯 mục tiêu {targetChars.toLocaleString()} ký tự / {p.duration} phút · không ngắn hơn 15%, có thể dài hơn</span>
          {proseReady && !p.longStory && duration.outsideTolerance && <span role="alert" style={{ color: 'var(--warning)' }}>
            Thời lượng ngắn hơn {Math.abs(duration.deviationPercent)}% so với mục tiêu. Truyện đã kết thúc; không tự thêm hoặc cắt nội dung. Hãy kiểm tra dàn ý nếu cần điều chỉnh.
          </span>}
          {p.outline && <span>📖 {p.outline.chapters.length} chương</span>}
          {!!p.chapterMemories?.length && <span>Đã lưu memory {p.chapterMemories.filter((m) => m.complete).length} chương</span>}
        </div>
      )}

      <LogPanel logs={runtime.logs} />

      {unverifiedMemoryCount > 0 && <div className="duplicate-warning" role="status">
        Đã giữ nội dung truyện. Có {unverifiedMemoryCount} dữ kiện memory chưa xác thực; xem ID và dẫn chứng trong nhật ký. Tool không tự coi các dữ kiện này là đúng.
      </div>}

      <div className="story-output__actions">
        {proseReady && p.enableHook !== false && <>
          <button className="btn btn--secondary" onClick={() => handleExport('txt', false)}>📄 Tải truyện .txt (không hook)</button>
          {!!p.hookText && <button className="btn btn--secondary" onClick={() => handleExport('txt', true)}>📄 Tải truyện + hook .txt</button>}
        </>}
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
            <button className="btn btn--secondary" onClick={() => handleExport('json')}>📄 Xuất .json</button>
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
