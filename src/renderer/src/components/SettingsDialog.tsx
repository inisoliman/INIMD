import { DEFAULT_SETTINGS, FONT_CHOICES, type Settings } from '@shared/types'
import { Icon } from './Icon'
import { Modal } from './Modal'

interface SettingsDialogProps {
  settings: Settings
  version: string
  onChange: (patch: Partial<Settings>) => void
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

export function SettingsDialog({ settings, version, onChange, onClose }: SettingsDialogProps): React.ReactElement {
  return (
    <Modal
      title="الإعدادات"
      onClose={onClose}
      width={620}
      footer={
        <div className="settings-footer">
          <span className="version">مِداد {version}</span>
          <button className="ghost-btn" onClick={() => onChange(DEFAULT_SETTINGS)}>
            استعادة الافتراضي
          </button>
          <button className="primary-btn" onClick={onClose}>
            تم
          </button>
        </div>
      }
    >
      <section className="settings-section">
        <h3>
          <Icon name="sun" size={15} /> المظهر
        </h3>
        <div className="setting-row">
          <span className="setting-label">السمة</span>
          <div className="segmented wide">
            <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => onChange({ theme: 'light' })}>
              فاتح
            </button>
            <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => onChange({ theme: 'dark' })}>
              داكن
            </button>
            <button className={settings.theme === 'system' ? 'active' : ''} onClick={() => onChange({ theme: 'system' })}>
              تلقائي
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">الخط</span>
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
            حجم الخط <b>{settings.fontSize}px</b>
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
            تباعد الأسطر <b>{settings.lineHeight.toFixed(1)}</b>
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

        <p className="setting-note">ملاحظة: تتوفر الخطوط المثبتة على جهازك فقط. Segoe UI وTahoma متاحان دائماً على ويندوز.</p>
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="edit" size={15} /> التحرير
        </h3>
        <Toggle
          checked={settings.autosave}
          onChange={(value) => onChange({ autosave: value })}
          label="الحفظ التلقائي"
          hint="حفظ الملف بعد ثانية من التوقف عن الكتابة."
        />
        <Toggle
          checked={settings.spellcheck}
          onChange={(value) => {
            onChange({ spellcheck: value })
            window.api.setSpellcheck(value)
          }}
          label="التصحيح الإملائي"
          hint="يستخدم قواميس ويندوز العربية والإنجليزية."
        />
        <div className="setting-row">
          <span className="setting-label">الاتجاه الافتراضي</span>
          <select
            value={settings.defaultDirection}
            onChange={(event) => onChange({ defaultDirection: event.target.value as Settings['defaultDirection'] })}
          >
            <option value="auto">تلقائي حسب المحتوى</option>
            <option value="rtl">من اليمين إلى اليسار</option>
            <option value="ltr">من اليسار إلى اليمين</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3>
          <Icon name="pdf" size={15} /> التصدير
        </h3>
        <div className="setting-row">
          <span className="setting-label">حجم الصفحة</span>
          <select value={settings.pageSize} onChange={(event) => onChange({ pageSize: event.target.value as Settings['pageSize'] })}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </div>
        <div className="setting-row">
          <span className="setting-label">
            الهوامش <b>{settings.margin}mm</b>
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
          label="أرقام الصفحات"
          hint="إضافة تذييل «صفحة X من Y» في PDF."
        />
      </section>
    </Modal>
  )
}
