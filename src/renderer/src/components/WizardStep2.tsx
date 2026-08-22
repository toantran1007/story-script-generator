import type { JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { StopButton } from '@/components/StopButton'

function RewriteStep2(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { setChosenDirection, generateOutline, setStep, clearError } = useAppStore()

  if (!p) return <div />

  const handleGenerate = (): void => {
    if (!p.chosenDirection.trim()) return
    generateOutline()
  }

  if (runtime.isLoadingQuestions) {
    return (
      <div className="wizard">
        <div className="wizard__header">
          <div className="wizard__steps-indicator">
            <div className="wizard__step-dot wizard__step-dot--done">✓</div>
            <div className="wizard__step-line wizard__step-line--done" />
            <div className="wizard__step-dot wizard__step-dot--active">2</div>
            <div className="wizard__step-line" />
            <div className="wizard__step-dot">3</div>
          </div>
          <h1 className="wizard__title">🔍 Đang phân tích kịch bản...</h1>
          <p className="wizard__subtitle">{runtime.generationProgress || 'AI đang đọc và phân tích nội dung'}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <StopButton />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="loading-skeleton" style={{ height: 80, width: '100%' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="wizard" style={{ maxWidth: 800 }}>
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">2</div>
          <div className="wizard__step-line" />
          <div className="wizard__step-dot">3</div>
        </div>
        <h1 className="wizard__title">📊 Kết quả phân tích</h1>
        <p className="wizard__subtitle">Chọn một hướng viết lại hoặc tùy chỉnh theo ý bạn</p>
      </div>

      {runtime.error && (
        <div className="error-banner">
          <span>{runtime.error}</span>
          <button className="error-banner__close" onClick={clearError}>✕</button>
        </div>
      )}

      {/* Analysis */}
      <div className="analysis-card">
        <div className="analysis-card__label">🔍 Phân tích kịch bản gốc</div>
        <div className="analysis-card__content">{p.scriptAnalysis}</div>
      </div>

      {/* Direction suggestions */}
      <div className="directions-section">
        <div className="directions-section__label">🧭 Hướng viết lại đề xuất</div>
        <div className="directions-grid">
          {p.suggestedDirections.map((dir, idx) => (
            <div
              key={idx}
              className={`direction-card ${p.chosenDirection === dir ? 'direction-card--active' : ''}`}
              onClick={() => setChosenDirection(dir)}
            >
              <div className="direction-card__number">Hướng {idx + 1}</div>
              <div className="direction-card__text">{dir}</div>
              {p.chosenDirection === dir && (
                <div className="direction-card__check">✓ Đã chọn</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom direction */}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label">✏️ Hoặc nhập hướng đi riêng</label>
        <textarea
          className="form-textarea"
          placeholder="Mô tả hướng viết lại theo ý bạn... (VD: Giữ nhân vật chính nhưng chuyển sang bối cảnh Việt Nam thập niên 80, thêm yếu tố ma thuật)"
          value={p.suggestedDirections.includes(p.chosenDirection) ? '' : p.chosenDirection}
          onChange={(e) => setChosenDirection(e.target.value)}
          rows={3}
        />
      </div>

      <div className="btn-group" style={{ marginTop: 24 }}>
        <button className="btn btn--secondary" onClick={() => setStep(1)}>← Quay lại</button>
        <button
          className="btn btn--primary"
          onClick={handleGenerate}
          disabled={!p.chosenDirection.trim() || runtime.isGenerating}
        >
          {runtime.isGenerating ? (
            <><span className="story-output__spinner" />Đang tạo dàn ý...</>
          ) : (
            'Tạo dàn ý viết lại →'
          )}
        </button>
      </div>
    </div>
  )
}

function NewStep2(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  const runtime = useAppStore((s) => s.getActiveRuntime())
  const { setAnswer, setStep, generateOutline, clearError, retryLastAction } = useAppStore()

  if (!p) return <div />

  const allAnswered = p.questions.every((_, i) => p.answers[i]?.trim())

  // Auto mode: show processing state
  if (p.mode === 'auto' && (runtime.isLoadingQuestions || runtime.isGenerating)) {
    return (
      <div className="wizard">
        <div className="wizard__header">
          <div className="wizard__steps-indicator">
            <div className="wizard__step-dot wizard__step-dot--done">✓</div>
            <div className="wizard__step-line wizard__step-line--done" />
            <div className="wizard__step-dot wizard__step-dot--active">2</div>
            <div className="wizard__step-line" />
            <div className="wizard__step-dot">3</div>
          </div>
          <h1 className="wizard__title">🤖 AI đang tự xử lý...</h1>
          <p className="wizard__subtitle">
            {runtime.generationProgress || 'Đang trả lời câu hỏi và tạo dàn ý tự động'}
          </p>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="loading-skeleton" style={{ height: 80, width: '100%' }} />
          ))}
        </div>
      </div>
    )
  }

  // Auto mode: answers ready but outline not yet generating — show auto-completed answers
  if (p.mode === 'auto' && allAnswered && p.outlinePhase === 'idle') {
    return (
      <div className="wizard">
        <div className="wizard__header">
          <div className="wizard__steps-indicator">
            <div className="wizard__step-dot wizard__step-dot--done">✓</div>
            <div className="wizard__step-line wizard__step-line--done" />
            <div className="wizard__step-dot wizard__step-dot--active">2</div>
            <div className="wizard__step-line" />
            <div className="wizard__step-dot">3</div>
          </div>
          <h1 className="wizard__title">🤖 AI đã trả lời tự động</h1>
          <p className="wizard__subtitle">Xem kết quả bên dưới hoặc bấm tiếp tục</p>
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

        {p.questions.map((question, idx) => (
          <div key={idx} className="question-card">
            <div className="question-card__number">Câu hỏi {idx + 1}</div>
            <div className="question-card__text">{question}</div>
            <textarea
              className="question-card__answer"
              placeholder="Câu trả lời của bạn..."
              value={p.answers[idx] || ''}
              onChange={(e) => setAnswer(idx, e.target.value)}
            />
          </div>
        ))}

        <div className="btn-group" style={{ marginTop: 24 }}>
          <button className="btn btn--secondary" onClick={() => setStep(1)}>← Quay lại</button>
          <button className="btn btn--primary" onClick={() => generateOutline()}>
            Tạo dàn ý →
          </button>
        </div>
      </div>
    )
  }

  // Loading questions
  if (runtime.isLoadingQuestions) {
    return (
      <div className="wizard">
        <div className="wizard__header">
          <div className="wizard__steps-indicator">
            <div className="wizard__step-dot wizard__step-dot--done">✓</div>
            <div className="wizard__step-line wizard__step-line--done" />
            <div className="wizard__step-dot wizard__step-dot--active">2</div>
            <div className="wizard__step-line" />
            <div className="wizard__step-dot">3</div>
          </div>
          <h1 className="wizard__title">AI đang suy nghĩ...</h1>
          <p className="wizard__subtitle">Đang tạo câu hỏi chiến lược cho câu chuyện của bạn</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <StopButton />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="loading-skeleton" style={{ height: 80, width: '100%' }} />
          ))}
        </div>
      </div>
    )
  }

  // Manual mode: show question form
  return (
    <div className="wizard">
      <div className="wizard__header">
        <div className="wizard__steps-indicator">
          <div className="wizard__step-dot wizard__step-dot--done">✓</div>
          <div className="wizard__step-line wizard__step-line--done" />
          <div className="wizard__step-dot wizard__step-dot--active">2</div>
          <div className="wizard__step-line" />
          <div className="wizard__step-dot">3</div>
        </div>
        <h1 className="wizard__title">Định hình câu chuyện</h1>
        <p className="wizard__subtitle">Trả lời các câu hỏi để câu chuyện có chiều sâu và tính độc đáo hơn</p>
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

      {p.questions.map((question, idx) => (
        <div key={idx} className="question-card">
          <div className="question-card__number">Câu hỏi {idx + 1}</div>
          <div className="question-card__text">{question}</div>
          <textarea
            className="question-card__answer"
            placeholder="Câu trả lời của bạn..."
            value={p.answers[idx] || ''}
            onChange={(e) => setAnswer(idx, e.target.value)}
          />
        </div>
      ))}

      <div className="btn-group" style={{ marginTop: 24 }}>
        <button className="btn btn--secondary" onClick={() => setStep(1)}>← Quay lại</button>
        <button
          className="btn btn--primary"
          onClick={() => generateOutline()}
          disabled={!allAnswered}
        >
          Tạo dàn ý →
        </button>
      </div>
    </div>
  )
}

export function WizardStep2(): JSX.Element {
  const p = useAppStore((s) => s.getActiveProject())
  if (!p) return <div />

  return p.projectType === 'rewrite' ? <RewriteStep2 /> : <NewStep2 />
}
