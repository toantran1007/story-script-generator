import type { JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'
import { targetCharsFor, charsPerMinute, READING_SPEED_MIN, READING_SPEED_MAX } from '@/services/textMetrics'
import type { StoryStyle, Language } from '@/types'
import { STYLE_LABELS, LANGUAGE_LABELS } from '@/types'

function getLengthEstimate(minutes: number, language: Language, readingSpeed?: number): string {
  const chars = targetCharsFor(minutes, language, readingSpeed)
  if (chars >= 1000) return `~${(chars / 1000).toFixed(1)}k ký tự`
  return `~${chars} ký tự`
}

function getChapterEstimate(minutes: number): string {
  if (minutes <= 10) return '1 chương'
  if (minutes <= 20) return '2 chương'
  if (minutes <= 30) return '3 chương'
  if (minutes <= 45) return '5 chương'
  if (minutes <= 60) return '7 chương'
  return `${Math.ceil(minutes / 8)} chương`
}

export function WizardStep1(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const settings = useAppStore((s) => s.settings)
  const savedStyles = useAppStore((s) => s.savedStyles)
  const savedLanguages = useAppStore((s) => s.savedLanguages)
  const {
    setIdea, setStoryNotes, setAutoFlow, setStyle, setCustomStyle, setLanguage,
    setCustomLanguage, setDuration, setReadingSpeed, setMode,
    setOriginalScript,
    generateQuestions, analyzeScript,
    clearError, setSettingsOpen,
    saveCustomStylePreset, deleteCustomStylePreset,
    saveCustomLanguagePreset, deleteCustomLanguagePreset
  } = useAppStore()

  if (!p) return <div />

  const isRewrite = p.projectType === 'rewrite'

  const canProceed = isRewrite
    ? p.originalScript.trim().length > 0 && settings.apiKey.length > 0
    : p.idea.trim().length > 0 && settings.apiKey.length > 0

  const handleSubmit = (): void => {
    if (!canProceed) return
    if (isRewrite) {
      analyzeScript()
    } else {
      generateQuestions()
    }
  }

  const styles = Object.keys(STYLE_LABELS) as StoryStyle[]
  const languages = Object.keys(LANGUAGE_LABELS) as Language[]

  return (
    <div className="wizard">
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--active">1</div>
          <div className="wizard__step-line" />
          <div className="wizard__step-dot">2</div>
          <div className="wizard__step-line" />
          <div className="wizard__step-dot">3</div>
        </div>
        <h1 className="wizard__title">
          {isRewrite ? '🔄 Viết lại kịch bản' : '✨ Tạo truyện mới'}
        </h1>
        <p className="wizard__subtitle">
          {isRewrite
            ? 'Dán kịch bản gốc để AI phân tích và đề xuất hướng viết lại mới'
            : 'Nhập ý tưởng và thiết lập thông số cho câu chuyện'
          }
        </p>
      </div>

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <button className="error-banner__close" onClick={clearError}>✕</button>
        </div>
      )}

      {!settings.apiKey && (
        <div className="duplicate-warning" style={{ marginBottom: 20 }}>
          ⚠ Chưa cấu hình khóa API.
          <button className="btn btn--sm btn--ghost" onClick={() => setSettingsOpen(true)}>
            Mở Cài đặt
          </button>
        </div>
      )}

      {/* === Content input: Idea (new) or Original Script (rewrite) === */}
      {isRewrite ? (
        <div className="form-group">
          <label className="form-label">📄 Kịch bản gốc</label>
          <textarea
            className="form-textarea"
            placeholder="Dán toàn bộ kịch bản/truyện gốc vào đây..."
            value={p.originalScript}
            onChange={(e) => setOriginalScript(e.target.value)}
            rows={10}
            style={{ minHeight: 200, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
          <div className="form-hint">
            {p.originalScript.trim()
              ? `📊 ${p.originalScript.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} từ · AI sẽ phân tích nội dung và đề xuất hướng viết lại`
              : 'Hỗ trợ mọi ngôn ngữ. AI sẽ tự phát hiện ngôn ngữ gốc.'}
          </div>
        </div>
      ) : (
        <div className="form-group">
          <label className="form-label">Ý tưởng truyện</label>
          <textarea
            className="form-textarea"
            placeholder="Mô tả ý tưởng câu chuyện... (VD: Một đầu bếp du hành thời gian phải nấu bữa ăn ngăn chiến tranh)"
            value={p.idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
          />
        </div>
      )}

      {/* Ghi chú / lưu ý — AI tuân theo ở mọi bước */}
      <div className="form-group">
        <label className="form-label">📌 Ghi chú / lưu ý cho truyện (tùy chọn)</label>
        <textarea
          className="form-textarea"
          style={{ minHeight: 70 }}
          placeholder="VD: Nhấn mạnh tình mẫu tử, không có yếu tố bạo lực, nhân vật chính là bé gái 10 tuổi, kết thúc phải có hậu..."
          value={p.storyNotes || ''}
          onChange={(e) => setStoryNotes(e.target.value)}
          rows={3}
        />
        <div className="form-hint">
          AI sẽ tuân theo các lưu ý này ở mọi bước: đặt câu hỏi, xây dàn ý và khi viết truyện.
        </div>
      </div>

      <div className="row">
        <div className="form-group">
          <label className="form-label">
            {isRewrite ? 'Phong cách viết lại' : 'Phong cách kể chuyện'}
          </label>
          <select
            className="form-select"
            value={p.style}
            onChange={(e) => setStyle(e.target.value as StoryStyle)}
          >
            {styles.map((s) => (
              <option key={s} value={s}>{STYLE_LABELS[s].vi}</option>
            ))}
          </select>

          {p.style === 'custom' && (
            <div className="custom-preset-input">
              <input
                className="form-input"
                placeholder="Mô tả phong cách tùy chỉnh..."
                value={p.customStyle}
                onChange={(e) => setCustomStyle(e.target.value)}
              />
              <button
                className="btn btn--sm btn--primary custom-preset-input__save"
                disabled={!p.customStyle.trim()}
                onClick={() => saveCustomStylePreset(p.customStyle)}
                title="Lưu phong cách này"
              >
                💾 Lưu
              </button>
            </div>
          )}

          {p.style === 'custom' && savedStyles.length > 0 && (
            <div className="custom-preset-chips">
              <span className="custom-preset-chips__label">Đã lưu:</span>
              {savedStyles.map((s) => (
                <div
                  key={s}
                  className={`custom-preset-chip ${p.customStyle === s ? 'custom-preset-chip--active' : ''}`}
                  onClick={() => setCustomStyle(s)}
                >
                  <span className="custom-preset-chip__text">{s}</span>
                  <button
                    className="custom-preset-chip__delete"
                    onClick={(e) => { e.stopPropagation(); deleteCustomStylePreset(s) }}
                    title="Xóa"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Ngôn ngữ đầu ra</label>
          <select
            className="form-select"
            value={p.language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {languages.map((l) => (
              <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
            ))}
          </select>

          {p.language === 'custom' && (
            <div className="custom-preset-input">
              <input
                className="form-input"
                placeholder="Mô tả ngôn ngữ và giọng điệu..."
                value={p.customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
              />
              <button
                className="btn btn--sm btn--primary custom-preset-input__save"
                disabled={!p.customLanguage.trim()}
                onClick={() => saveCustomLanguagePreset(p.customLanguage)}
                title="Lưu ngôn ngữ này"
              >
                💾 Lưu
              </button>
            </div>
          )}

          {p.language === 'custom' && savedLanguages.length > 0 && (
            <div className="custom-preset-chips">
              <span className="custom-preset-chips__label">Đã lưu:</span>
              {savedLanguages.map((l) => (
                <div
                  key={l}
                  className={`custom-preset-chip ${p.customLanguage === l ? 'custom-preset-chip--active' : ''}`}
                  onClick={() => setCustomLanguage(l)}
                >
                  <span className="custom-preset-chip__text">{l}</span>
                  <button
                    className="custom-preset-chip__delete"
                    onClick={(e) => { e.stopPropagation(); deleteCustomLanguagePreset(l) }}
                    title="Xóa"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Thời lượng truyện: {p.duration} phút</label>
        <div className="duration-control">
          <input
            type="range"
            className="duration-slider"
            min={5}
            max={120}
            step={5}
            value={p.duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
          <span className="duration-value">{p.duration} phút</span>
        </div>
        <div className="duration-estimate">
          {getLengthEstimate(p.duration, p.language, p.readingSpeed)} · {getChapterEstimate(p.duration)}
          {p.duration >= 30 && ' · Sinh từng chương để đảm bảo chất lượng'}
        </div>
      </div>

      {/* Tốc độ đọc — quyết định số ký tự cho mỗi phút thời lượng */}
      <div className="form-group">
        <label className="form-label">
          🗣 Tốc độ đọc: {charsPerMinute(p.language, p.readingSpeed).toLocaleString()} ký tự/phút
          {p.readingSpeed ? ' (tự khai)' : ' (mặc định theo ngôn ngữ)'}
        </label>
        <div className="duration-control">
          <input
            className="form-input"
            type="number"
            min={READING_SPEED_MIN}
            max={READING_SPEED_MAX}
            step={50}
            placeholder={`Mặc định: ${charsPerMinute(p.language)}`}
            value={p.readingSpeed || ''}
            onChange={(e) => setReadingSpeed(Number(e.target.value) || 0)}
            style={{ maxWidth: 200 }}
          />
          {!!p.readingSpeed && (
            <button className="btn btn--ghost btn--sm" onClick={() => setReadingSpeed(0)}>
              ↺ Dùng mặc định
            </button>
          )}
        </div>
        <div className="form-hint">
          Số ký tự đọc thành tiếng trong 1 phút. Độ dài truyện = thời lượng × tốc độ này.
          Để trống nếu không rõ. Cách đo nhanh: đọc to một đoạn trong 1 phút rồi đếm ký tự đã đọc.
        </div>
      </div>

      {!isRewrite && (
        <div className="form-group">
          <label className="form-label">Chế độ tạo truyện</label>
          <div className="mode-toggle">
            <button
              className={`mode-toggle__option ${p.mode === 'guided' ? 'mode-toggle__option--active' : ''}`}
              onClick={() => setMode('guided')}
            >
              🎯 Hướng dẫn — Trả lời câu hỏi để định hình truyện
            </button>
            <button
              className={`mode-toggle__option ${p.mode === 'auto' ? 'mode-toggle__option--active' : ''}`}
              onClick={() => setMode('auto')}
            >
              🤖 Tự động — AI tự quyết định mọi thứ
            </button>
          </div>
        </div>
      )}

      {/* Tự động xuyên suốt các bước */}
      <div className="form-group">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={!!p.autoFlow}
            onChange={(e) => setAutoFlow(e.target.checked)}
          />
          <span>
            🚀 <strong>Tự động xuyên suốt</strong> — có dàn ý là viết truyện ngay, không dừng ở bước xem trước
          </span>
        </label>
        {p.autoFlow && (
          <div className="form-hint">
            {!isRewrite && p.mode === 'auto'
              ? 'Toàn bộ quy trình sẽ tự chạy: câu hỏi → AI trả lời → dàn ý → viết truyện. Chỉ dừng nếu phát hiện trùng cốt truyện.'
              : 'Sau khi bạn hoàn thành bước hiện tại, dàn ý tạo xong sẽ viết ngay. Chỉ dừng nếu phát hiện trùng cốt truyện.'}
          </div>
        )}
      </div>

      <div className="btn-group" style={{ marginTop: 24 }}>
        <button
          className="btn btn--primary"
          disabled={!canProceed || runtime.isLoadingQuestions}
          onClick={handleSubmit}
        >
          {runtime.isLoadingQuestions ? (
            <>
              <span className="story-output__spinner" />
              {isRewrite ? 'Đang phân tích...' : 'Đang xử lý...'}
            </>
          ) : (
            isRewrite ? 'Phân tích kịch bản →' : 'Tạo truyện →'
          )}
        </button>
        <StopButton full />
      </div>
    </div>
  )
}
