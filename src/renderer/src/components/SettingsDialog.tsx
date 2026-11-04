import { DEFAULT_SETTINGS, FONT_CHOICES, type Settings, type UpdateStatus } from '@shared/types'
import { LANGUAGES } from '@shared/i18n'
import { useI18n } from '../lib/i18n'
import { Icon } from './Icon'
import { Modal } from './Modal'

interface SettingsDialogProps {
  settings: Settings
  version: string
  updateStatus: UpdateStatus
  onChange: (patch: Partial<Settings>) => void
  onCheckUpdates: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onClose: () => void
}

function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}): React.ReactElement {
  return (
    <label className="setting-row toggle-row">
      <span className="setting-text">
        <span className="setting-label">{label}</span>
        {hint ? <span className="setting-hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </label>
  )
}

export function SettingsDialog({
  settings,
  version,
  updateStatus,
  onChange,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onClose
}: SettingsDialogProps): React.ReactElement {
  const { t } = useI18n()

  const updateMessage = ((): string => {
    switch (updateStatus.state) {
      case 'checking':
        return t('settings.checking')
      case 'available':
        return t('settings.updateAvailable', { version: updateStatus.version ?? '' })
      case 'downloading':
        return t('settings.downloading', { percent: updateStatus.percent ?? 0 })
      case 'downloaded':
        return t('settings.updateReady', { version: updateStatus.version ?? '' })
      case 'not-available':
        return t('settings.upToDate', { version: updateStatus.version ?? version })
      case 'error':
        return t('settings.updateError', { error: updateStatus.message ?? '' })
      case 'disabled':
        return t('settings.updateDev')
      default:
        return t('settings.firstCheckHint')
    }
  })()

  const busy = updateStatus.state === 'checking' || updateStatus.state === 'downloading'

  return (
    <Modal
      title={t('settings.title')}
      onClose={onClose}
      width={640}
      footer={
        <div className="settings-footer">
          <span className="version">{t('settings.version', { version })}</span>
          <button className="ghost-btn" onClick={() => onChange(DEFAULT_SETTINGS)}>
            {t('settings.restore')}
          </button>
          <button className="primary-btn" onClick={onClose}>
            {t('settings.done')}
          </button>
        </div>
      }
    >
      <section className="settings-section">
        <h3>
          <Icon name="sparkle" size={15} /> {t('settings.language')}
        </h3>
        <div className="setting-row">
          <span className="setting-label">{t('settings.language')}</span>
          <div className="segmented wide">
            {LANGUAGES.map((item) => (
              <button
                key={item.id}
                className={settings.language === item.id ? 'active' : ''}
                onClick={() => onChange({ language: item.id })}
              >
                {item.native}
              </button>
            ))}
          </div>
        </div>
        <p className="setting-note">{t('settings.languageHint')}</p>
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="sun" size={15} /> {t('settings.appearance')}
        </h3>
        <div className="setting-row">
          <span className="setting-label">{t('settings.theme')}</span>
          <div className="segmented wide">
            <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => onChange({ theme: 'light' })}>
              {t('theme.light')}
            </button>
            <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => onChange({ theme: 'dark' })}>
              {t('theme.dark')}
            </button>
            <button className={settings.theme === 'system' ? 'active' : ''} onClick={() => onChange({ theme: 'system' })}>
              {t('theme.system')}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">{t('settings.font')}</span>
          <select value={settings.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
            {FONT_CHOICES.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <span className="setting-label">
            {t('settings.fontSize')} <b>{settings.fontSize}px</b>
          </span>
          <input
            type="range"
            min={12}
            max={26}
            step={1}
            value={settings.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </div>

        <div className="setting-row">
          <span className="setting-label">
            {t('settings.lineHeight')} <b>{settings.lineHeight.toFixed(1)}</b>
          </span>
          <input
            type="range"
            min={1.4}
            max={2.4}
            step={0.1}
            value={settings.lineHeight}
            onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
          />
        </div>

        <p className="setting-note">{t('settings.fontNote')}</p>
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="edit" size={15} /> {t('settings.editing')}
        </h3>
        <Toggle
          checked={settings.autosave}
          onChange={(value) => onChange({ autosave: value })}
          label={t('settings.autosave')}
          hint={t('settings.autosaveHint')}
        />
        <Toggle
          checked={settings.spellcheck}
          onChange={(value) => {
            onChange({ spellcheck: value })
            window.api.setSpellcheck(value)
          }}
          label={t('settings.spellcheck')}
          hint={t('settings.spellcheckHint')}
        />
        <div className="setting-row">
          <span className="setting-label">{t('settings.defaultDirection')}</span>
          <select
            value={settings.defaultDirection}
            onChange={(event) => onChange({ defaultDirection: event.target.value as Settings['defaultDirection'] })}
          >
            <option value="auto">{t('settings.directionAuto')}</option>
            <option value="rtl">{t('settings.directionRtl')}</option>
            <option value="ltr">{t('settings.directionLtr')}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="pdf" size={15} /> {t('settings.export')}
        </h3>
        <div className="setting-row">
          <span className="setting-label">{t('settings.pageSize')}</span>
          <select value={settings.pageSize} onChange={(event) => onChange({ pageSize: event.target.value as Settings['pageSize'] })}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </div>
        <div className="setting-row">
          <span className="setting-label">
            {t('settings.margins')} <b>{settings.margin}mm</b>
          </span>
          <input
            type="range"
            min={5}
            max={40}
            step={1}
            value={settings.margin}
            onChange={(event) => onChange({ margin: Number(event.target.value) })}
          />
        </div>
        <Toggle
          checked={settings.pageNumbers}
          onChange={(value) => onChange({ pageNumbers: value })}
          label={t('settings.pageNumbers')}
          hint={t('settings.pageNumbersHint')}
        />
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="sparkle" size={15} /> {t('settings.updates')}
        </h3>
        <Toggle
          checked={settings.autoUpdate}
          onChange={(value) => onChange({ autoUpdate: value })}
          label={t('settings.autoUpdate')}
          hint={t('settings.autoUpdateHint')}
        />
        <div className="setting-row">
          <span className="setting-label">{t('settings.updateToken')}</span>
          <input
            type="password"
            className="token-input"
            dir="ltr"
            value={settings.updateToken}
            placeholder="ghp_…"
            onChange={(event) => onChange({ updateToken: event.target.value.trim() })}
          />
        </div>
        <p className="setting-note">{t('settings.updateTokenHint')}</p>

        <div className="update-state">
          <span className={`update-dot ${updateStatus.state}`} />
          <span className="update-text">{updateMessage}</span>
          <div className="update-actions">
            <button className="ghost-btn" onClick={onCheckUpdates} disabled={busy}>
              {updateStatus.state === 'checking' ? t('settings.checking') : t('settings.checkNow')}
            </button>
            {updateStatus.state === 'available' ? (
              <button className="primary-btn" onClick={onDownloadUpdate}>
                {t('settings.download')}
              </button>
            ) : null}
            {updateStatus.state === 'downloaded' ? (
              <button className="primary-btn" onClick={onInstallUpdate}>
                {t('settings.installNow')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </Modal>
  )
}
