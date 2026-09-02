import { useEffect, useState, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'
import { LogPanel } from '@/components/LogPanel'
import {
  targetCharsFor,
  charsPerMinute,
  READING_SPEED_MIN,
  READING_SPEED_MAX,
  DURATION_MIN,
  DURATION_MAX,
  normalizeDuration
} from '@/services/textMetrics'
import type { StoryStyle, Language, TransformationLevel } from '@/types'
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
  return `${Math.min(30, Math.ceil(minutes / 8))} chương`
}

export function WizardStep1(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const settings = useAppStore((s) => s.settings)
  const savedStyles = useAppStore((s) => s.savedStyles)
  const savedLanguages = useAppStore((s) => s.savedLanguages)
  const {
    setIdea, setTransformationLevel, setStoryNotes, setAutoFlow, setEnableHook, setStyle, setCustomStyle, setLanguage,
    setCustomLanguage, setDuration, setReadingSpeed, setMode,
    generateQuestions,
    clearError, setSettingsOpen,
    saveCustomStylePreset, deleteCustomStylePreset,
    saveCustomLanguagePreset, deleteCustomLanguagePreset
  } = useAppStore()
  const [durationInput, setDurationInput] = useState('30')
  const [isImporting, setIsImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setDurationInput(String(p?.duration ?? 30))
  }, [p?.id, p?.duration])

  if (!p) return <div />

  const commitDurationInput = (): void => {
    const normalized = durationInput.trim()
      ? normalizeDuration(Number(durationInput))
      : p.duration
    setDuration(normalized)
    setDurationInput(String(normalized))
  }

  const canProceed = p.idea.trim().length > 0 && settings.apiKey.length > 0

  const handleSubmit = (): void => {
    if (!canProceed) return
    generateQuestions()
  }

  const handleImportTxt = async (): Promise<void> => {
    setIsImporting(true)
    setImportStatus(null)
    try {
      const file = await window.api.readTxtFile()
      if (!file) return
      setIdea(file.content)
      setImportStatus({
        type: 'success',
        text: `Đã nạp ${file.name} · ${(file.bytes / 1024).toFixed(1)} KB · ${file.content.length.toLocaleString()} ký tự`
      })
    } catch (error) {
      const message = String(error)
        .replace(/^Error:\s*/, '')
        .replace(/^Error invoking remote method 'file:read-txt':\s*/, '')
      setImportStatus({ type: 'error', text: message })
    } finally {
      setIsImporting(false)
    }
  }

  const styles = Object.keys(STYLE_LABELS) as StoryStyle[]
  const languages = Object.keys(LANGUAGE_LABELS) as Language[]
  const transformationLevels: { id: TransformationLevel; title: string; description: string }[] = [
    { id: 'develop', title: 'Phát triển', description: 'Giữ tinh thần chính, mở rộng bằng nhân vật và tình huống mới' },
    { id: 'original', title: 'Sáng tạo mới', description: 'Giữ điểm hấp dẫn trừu tượng, thay đổi sâu cốt truyện' },
    { id: 'reborn', title: 'Tái sinh', description: 'Chỉ giữ thông điệp/cảm xúc, tái tạo gần như toàn bộ' }
  ]

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
        <h1 className="wizard__title">✨ Tạo truyện mới</h1>
        <p className="wizard__subtitle">Nhập ý tưởng hoặc chọn file TXT và thiết lập thông số cho câu chuyện</p>
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

      <div className="form-group">
        <div className="content-input-header">
          <label className="form-label">Ý tưởng / tóm tắt / dàn ý tham khảo</label>
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={handleImportTxt}
            disabled={isImporting || runtime.isLoadingQuestions}
          >
            {isImporting ? 'Đang đọc file...' : '📄 Chọn file TXT'}
          </button>
        </div>
        <textarea
          className="form-textarea"
          placeholder="Mô tả ý tưởng hoặc chọn file TXT chứa nội dung kịch bản..."
          value={p.idea}
          onChange={(e) => {
            setIdea(e.target.value)
            setImportStatus(null)
          }}
          rows={8}
          style={{ minHeight: 180 }}
        />
        {importStatus && (
          <div className={`file-import-status file-import-status--${importStatus.type}`}>
            {importStatus.text}
          </div>
        )}
        <div className="form-hint">Hỗ trợ file .txt tối đa 5 MB và 120.000 ký tự, mã hóa UTF-8 hoặc UTF-16.</div>
      </div>

      <div className="form-group">
        <label className="form-label">Mức biến đổi để tạo truyện mới</label>
        <div className="transformation-levels">
          {transformationLevels.map((level) => (
            <button
              key={level.id}
              type="button"
              className={`transformation-level ${p.transformationLevel === level.id ? 'transformation-level--active' : ''}`}
              onClick={() => setTransformationLevel(level.id)}
            >
              <strong>{level.title}</strong>
              <span>{level.description}</span>
            </button>
          ))}
        </div>
        <div className="form-hint">Tên nhân vật, địa điểm, đồ vật và chuỗi tình huống từ nguồn luôn bị cấm dùng lại.</div>
      </div>

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
          AI sẽ tuân theo các lưu ý này ở mọi bước. Muốn giữ chính xác tên hoặc địa điểm nào từ nguồn, hãy ghi rõ tại đây.
        </div>
      </div>

      <div className="row">
        <div className="form-group">
          <label className="form-label">
            Phong cách kể chuyện
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
        <label className="form-label">⏱ Thời lượng truyện</label>
        <div className="duration-control">
          <input
            type="number"
            className="form-input duration-input"
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={1}
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={commitDurationInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
          />
          <span className="duration-value">phút</span>
        </div>
        <div className="duration-estimate">
          {getLengthEstimate(p.duration, p.language, p.readingSpeed)} · {getChapterEstimate(p.duration)}
          {p.duration >= 30 && ' · Sinh từng chương để đảm bảo chất lượng'}
        </div>
        <div className="form-hint">
          Nhập số phút mong muốn, từ {DURATION_MIN} đến {DURATION_MAX} phút.
        </div>
      </div>

      <div className="form-group">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={p.enableHook !== false}
            onChange={(e) => setEnableHook(e.target.checked)}
          />
          <span>
            🪝 <strong>Tạo hook mở đầu</strong> — mở truyện bằng tình huống hoặc câu hỏi giữ chân người nghe
          </span>
        </label>
        <div className="form-hint">
          {p.enableHook !== false
            ? 'Dàn ý và khoảng hai phút đầu sẽ được thiết kế để tạo tò mò, căng thẳng hoặc stakes rõ ràng.'
            : 'Truyện sẽ bắt đầu tự nhiên theo bối cảnh và nhân vật, không ép tạo hook hoặc curiosity loop.'}
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
            {p.mode === 'auto'
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
              Đang xử lý...
            </>
          ) : (
            'Tạo truyện →'
          )}
        </button>
        <StopButton full />
      </div>
      <LogPanel logs={runtime.logs} />
    </div>
  )
}
