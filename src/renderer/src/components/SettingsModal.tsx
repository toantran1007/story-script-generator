import { useState, useEffect, useCallback, type JSX } from 'react'
import { useAppStore } from '@/stores/storyStore'
import { testConnection } from '@/services/apiService'
import {
  API_PROVIDER_INFO,
  VILAO_API_PRESET,
  activateApiProvider,
  normalizeSettings,
  type ApiProviderId,
  type AppSettings
} from '@/types'

const API_PROVIDERS = Object.keys(API_PROVIDER_INFO) as ApiProviderId[]
const REMOVED_VILAO_MODELS_KEY = 'story-script-generator.removed-vilao-models'

export function SettingsModal(): JSX.Element {
  const { settings, saveSettings, setSettingsOpen } = useAppStore()

  const [form, setForm] = useState<AppSettings>(() => normalizeSettings(settings))
  const [models, setModels] = useState<string[]>([])
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [removedModels, setRemovedModels] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(REMOVED_VILAO_MODELS_KEY)
      const parsed: unknown = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed.filter((model): model is string => typeof model === 'string') : []
    } catch {
      return []
    }
  })
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingApi, setIsSavingApi] = useState(false)
  const [apiSaved, setApiSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    setForm(normalizeSettings(settings))
  }, [settings])

  useEffect(() => {
    window.localStorage.setItem(REMOVED_VILAO_MODELS_KEY, JSON.stringify(removedModels))
  }, [removedModels])

  const clearApiStatus = (): void => {
    setModels([])
    setDiscoveredModels([])
    setRemovedModels([])
    setConnectionError(null)
    setApiSaved(false)
  }

  const fetchModels = useCallback(async (candidate: AppSettings) => {
    if (!candidate.apiBaseUrl || !candidate.apiKey) return
    setIsFetchingModels(true)
    setConnectionError(null)
    setApiSaved(false)

    const result = await testConnection(candidate)
    if (result.success && result.models) {
      // Keep a persisted/manual model visible even when the provider catalog is stale.
      const discovered = result.models
      setDiscoveredModels(discovered)
      const shouldHideRemoved = candidate.apiProvider === 'vilao'
      const visibleDiscovered = shouldHideRemoved
        ? discovered.filter((model) => !removedModels.includes(model))
        : discovered
      const modelsWithCurrent = candidate.model && !discovered.includes(candidate.model) &&
        !(shouldHideRemoved && removedModels.includes(candidate.model))
        ? [candidate.model, ...visibleDiscovered]
        : visibleDiscovered
      setModels(modelsWithCurrent)
      const shouldSelectFirstLlm = discovered.length > 0 && !candidate.model
      if (shouldSelectFirstLlm) {
        setForm((current) => normalizeSettings({ ...current, model: discovered[0] }))
      }
    } else {
      setModels([])
      setConnectionError(result.error || 'Không thể kết nối tới API')
    }
    setIsFetchingModels(false)
  }, [removedModels])

  useEffect(() => {
    const initial = normalizeSettings(settings)
    if (initial.apiBaseUrl && initial.apiKey) void fetchModels(initial)
    // Only test the saved connection when the modal first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (field: keyof AppSettings, value: string | number): void => {
    setForm((current) => normalizeSettings({ ...current, [field]: value }))
    if (field === 'apiBaseUrl' || field === 'apiKey') {
      clearApiStatus()
    } else if (field === 'model') {
      setApiSaved(false)
      setRemovedModels((current) => current.filter((model) => model !== String(value).trim()))
    }
  }

  const handleProviderChange = (provider: ApiProviderId): void => {
    setForm((current) => activateApiProvider(current, provider))
    clearApiStatus()
  }

  const normalizedForm = (): AppSettings => normalizeSettings({
    ...form,
    apiBaseUrl: form.apiBaseUrl.trim().replace(/\/+$/, ''),
    apiKey: form.apiKey.trim(),
    model: form.model.trim()
  })

  const handleRefreshModels = (): void => {
    void fetchModels(normalizedForm())
  }

  const handleRemoveStaleModel = (): void => {
    const modelToRemove = form.model.trim()
    if (form.apiProvider !== 'vilao' || !modelToRemove || discoveredModels.includes(modelToRemove)) return

    setRemovedModels((current) => current.includes(modelToRemove) ? current : [...current, modelToRemove])
    setModels((current) => current.filter((model) => model !== modelToRemove))
    const fallbackModel = discoveredModels.find((model) => !removedModels.includes(model) && model !== modelToRemove) || ''
    setForm((current) => normalizeSettings({ ...current, model: fallbackModel }))
    setApiSaved(false)
  }

  const handleSaveApi = async (): Promise<void> => {
    setIsSavingApi(true)
    const next = normalizedForm()
    await saveSettings(next)
    setForm(next)
    setApiSaved(true)
    setIsSavingApi(false)
  }

  const handleSave = async (): Promise<void> => {
    setIsSaving(true)
    await saveSettings(normalizedForm())
    setIsSaving(false)
    setSettingsOpen(false)
  }

  const handleClose = (): void => {
    setSettingsOpen(false)
  }

  const modelPlaceholder = form.apiProvider === 'vilao'
    ? VILAO_API_PRESET.model
    : 'Nhập tên model của nhà cung cấp'

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">⚙ Cài đặt</h2>
          <button className="modal__close" onClick={handleClose} aria-label="Đóng">✕</button>
        </div>

        <div className="modal__body">
          <div className="form-group">
            <label className="form-label">Nhà cung cấp API</label>
            <div className="api-provider-grid">
              {API_PROVIDERS.map((provider) => {
                const info = API_PROVIDER_INFO[provider]
                const isActive = form.apiProvider === provider
                return (
                  <button
                    key={provider}
                    type="button"
                    className={`api-provider-card${isActive ? ' api-provider-card--active' : ''}`}
                    onClick={() => handleProviderChange(provider)}
                    aria-pressed={isActive}
                  >
                    <span className="api-provider-card__name">{info.name}</span>
                    <span className="api-provider-card__meta">{info.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Đường dẫn API (Base URL)</label>
            <input
              className="form-input"
              value={form.apiBaseUrl}
              onChange={(event) => handleChange('apiBaseUrl', event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Khóa API (API Key)</label>
            <div className="api-key-field">
              <input
                className="form-input"
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(event) => handleChange('apiKey', event.target.value)}
                placeholder={`Nhập API key cho ${API_PROVIDER_INFO[form.apiProvider].name}`}
                autoComplete="off"
              />
              <button
                type="button"
                className="api-key-field__toggle"
                onClick={() => setShowApiKey((visible) => !visible)}
                aria-label={showApiKey ? 'Ẩn API key' : 'Hiện API key'}
                aria-pressed={showApiKey}
              >
                {showApiKey ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mô hình (Model)</label>

            {isFetchingModels ? (
              <div className="api-model-loading">
                <span className="story-output__spinner" />
                <span>Đang tải danh sách mô hình...</span>
              </div>
            ) : models.length > 0 ? (
              <div className="api-model-picker api-model-picker--stacked">
                <select
                  className="form-select"
                  value={models.includes(form.model) ? form.model : ''}
                  onChange={(event) => handleChange('model', event.target.value)}
                >
                  <option value="">— Chọn model từ API —</option>
                  {models.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <input
                  className="form-input"
                  value={form.model}
                  onChange={(event) => handleChange('model', event.target.value)}
                  placeholder="Hoặc nhập model thủ công, ví dụ aaa/gpt-5.6-sol"
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm api-model-refresh"
                  onClick={handleRefreshModels}
                  disabled={!form.apiBaseUrl || !form.apiKey || isFetchingModels}
                  title="Tải lại toàn bộ model LLM từ Vilao"
                >
                  {isFetchingModels ? 'Đang tải...' : '↻ Làm mới model'}
                </button>
              </div>
            ) : (
              <div className="api-model-picker">
                <input
                  className="form-input"
                  value={form.model}
                  onChange={(event) => handleChange('model', event.target.value)}
                  placeholder={modelPlaceholder}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm api-model-refresh"
                  onClick={handleRefreshModels}
                  disabled={!form.apiBaseUrl || !form.apiKey || isFetchingModels}
                  title="Tải danh sách model LLM"
                >
                  {isFetchingModels ? 'Đang tải...' : '↻ Làm mới model'}
                </button>
              </div>
            )}

            {models.length > 0 && !isFetchingModels && (
              <div className="connection-status connection-status--success api-connection-message">
                ✓ Đã kết nối · {models.length} mô hình
              </div>
            )}
            {form.apiProvider === 'vilao' && form.model.trim() && !discoveredModels.includes(form.model.trim()) && !isFetchingModels && (
              <div className="api-stale-model-warning">
                <span>Model này không còn trong danh sách Vilao.</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleRemoveStaleModel}
                >
                  Xóa khỏi tool
                </button>
              </div>
            )}
            {connectionError && (
              <div className="connection-status connection-status--error api-connection-message">
                ✕ {connectionError}
              </div>
            )}
            {apiSaved && (
              <div className="connection-status connection-status--success api-connection-message">
                ✓ Đã lưu riêng cấu hình {API_PROVIDER_INFO[form.apiProvider].name}
              </div>
            )}

            <div className="api-connection-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleRefreshModels}
                disabled={!form.apiBaseUrl || !form.apiKey || isFetchingModels}
              >
                {models.length > 0 ? '↻ Kiểm tra lại' : 'Thử kết nối'}
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleSaveApi}
                disabled={isSavingApi}
              >
                {isSavingApi ? 'Đang lưu...' : 'Lưu API'}
              </button>
            </div>
          </div>

          <div className="row">
            <div className="form-group">
              <label className="form-label">Nhiệt độ (Temperature): {form.temperature}</label>
              <input
                type="range"
                className="duration-slider"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(event) => handleChange('temperature', Number(event.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Giới hạn token</label>
              <input
                className="form-input"
                type="number"
                value={form.maxTokens}
                onChange={(event) => handleChange('maxTokens', Number(event.target.value))}
                min={1024}
                max={128000}
              />
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={handleClose}>Hủy</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  )
}
