import type { Direction, LayoutMode, ThemeMode } from '@shared/types'
import { Icon } from './Icon'

interface ToolbarProps {
  hasTab: boolean
  dirty: boolean
  layout: LayoutMode
  sidebar: boolean
  theme: ThemeMode
  direction: Direction
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportPdf: () => void
  onExportDocx: () => void
  onToggleSidebar: () => void
  onLayout: (layout: LayoutMode) => void
  onCycleTheme: () => void
  onToggleDirection: () => void
  onSettings: () => void
}

const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'فاتح',
  dark: 'داكن',
  system: 'تلقائي'
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const { hasTab, dirty } = props

  return (
    <div className="toolbar">
      <div className="brand" title="INIMD — محرر Markdown عربي">
        <span className="brand-mark">INI</span>
        <span className="brand-name">INIMD</span>
      </div>

      <div className="toolbar-group">
        <button className="tb" onClick={props.onNew} title="ملف جديد (Ctrl+N)">
          <Icon name="new" />
          <span>جديد</span>
        </button>
        <button className="tb" onClick={props.onOpen} title="فتح ملف (Ctrl+O)">
          <Icon name="open" />
          <span>فتح</span>
        </button>
        <button className="tb" onClick={props.onSave} disabled={!hasTab} title="حفظ (Ctrl+S)">
          <Icon name="save" />
          <span>حفظ</span>
          {dirty ? <i className="dirty-dot" aria-hidden="true" /> : null}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tb"
          onClick={props.onExportPdf}
          disabled={!hasTab}
          title="تصدير إلى PDF (Ctrl+Alt+P)"
        >
          <Icon name="pdf" />
          <span>PDF</span>
        </button>
        <button
          className="tb"
          onClick={props.onExportDocx}
          disabled={!hasTab}
          title="تصدير إلى Word (Ctrl+Alt+W)"
        >
          <Icon name="word" />
          <span>Word</span>
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className={`tb icon-only ${props.sidebar ? 'active' : ''}`}
          onClick={props.onToggleSidebar}
          title="الشريط الجانبي (Ctrl+B)"
        >
          <Icon name="sidebar" />
        </button>
        <div className="segmented" role="group" aria-label="طريقة العرض">
          <button
            className={props.layout === 'editor' ? 'active' : ''}
            onClick={() => props.onLayout('editor')}
            title="التحرير فقط"
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            className={props.layout === 'split' ? 'active' : ''}
            onClick={() => props.onLayout('split')}
            title="عرض مقسوم"
          >
            <Icon name="split" size={16} />
          </button>
          <button
            className={props.layout === 'preview' ? 'active' : ''}
            onClick={() => props.onLayout('preview')}
            title="المعاينة فقط"
          >
            <Icon name="eye" size={16} />
          </button>
        </div>
        <button
          className="tb icon-only direction-btn"
          onClick={props.onToggleDirection}
          disabled={!hasTab}
          title={props.direction === 'rtl' ? 'الاتجاه: من اليمين إلى اليسار' : 'الاتجاه: من اليسار إلى اليمين'}
        >
          <Icon name="direction" style={{ transform: props.direction === 'rtl' ? 'scaleX(-1)' : 'none' }} />
        </button>
        <button className="tb icon-only" onClick={props.onCycleTheme} title={`المظهر: ${THEME_LABEL[props.theme]}`}>
          <Icon name={props.theme === 'dark' ? 'moon' : 'sun'} />
        </button>
        <button className="tb icon-only" onClick={props.onSettings} title="الإعدادات (Ctrl+,)">
          <Icon name="settings" />
        </button>
      </div>
    </div>
  )
}
