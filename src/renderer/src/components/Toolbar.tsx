import type { Direction, LayoutMode, ThemeMode } from '@shared/types'
import { useI18n } from '../lib/i18n'
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

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const { hasTab, dirty } = props
  const { t } = useI18n()
  const themeLabel: Record<ThemeMode, string> = {
    light: t('theme.light'),
    dark: t('theme.dark'),
    system: t('theme.system')
  }

  return (
    <div className="toolbar">
      <div className="brand" title={t('app.brandTitle')}>
        <span className="brand-mark">INI</span>
        <span className="brand-name">INIMD</span>
      </div>

      <div className="toolbar-group">
        <button className="tb" onClick={props.onNew} title={t('toolbar.newTitle')}>
          <Icon name="new" />
          <span>{t('toolbar.new')}</span>
        </button>
        <button className="tb" onClick={props.onOpen} title={t('toolbar.openTitle')}>
          <Icon name="open" />
          <span>{t('toolbar.open')}</span>
        </button>
        <button className="tb" onClick={props.onSave} disabled={!hasTab} title={t('toolbar.saveTitle')}>
          <Icon name="save" />
          <span>{t('toolbar.save')}</span>
          {dirty ? <i className="dirty-dot" aria-hidden="true" /> : null}
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tb" onClick={props.onExportPdf} disabled={!hasTab} title={t('toolbar.pdfTitle')}>
          <Icon name="pdf" />
          <span>PDF</span>
        </button>
        <button className="tb" onClick={props.onExportDocx} disabled={!hasTab} title={t('toolbar.wordTitle')}>
          <Icon name="word" />
          <span>Word</span>
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className={`tb icon-only ${props.sidebar ? 'active' : ''}`}
          onClick={props.onToggleSidebar}
          title={t('toolbar.sidebarTitle')}
        >
          <Icon name="sidebar" />
        </button>
        <div className="segmented" role="group" aria-label={t('toolbar.layoutAria')}>
          <button
            className={props.layout === 'editor' ? 'active' : ''}
            onClick={() => props.onLayout('editor')}
            title={t('toolbar.editorOnly')}
          >
            <Icon name="edit" size={16} />
          </button>
          <button
            className={props.layout === 'split' ? 'active' : ''}
            onClick={() => props.onLayout('split')}
            title={t('toolbar.split')}
          >
            <Icon name="split" size={16} />
          </button>
          <button
            className={props.layout === 'preview' ? 'active' : ''}
            onClick={() => props.onLayout('preview')}
            title={t('toolbar.previewOnly')}
          >
            <Icon name="eye" size={16} />
          </button>
        </div>
        <button
          className="tb icon-only direction-btn"
          onClick={props.onToggleDirection}
          disabled={!hasTab}
          title={props.direction === 'rtl' ? t('toolbar.directionRtl') : t('toolbar.directionLtr')}
        >
          <Icon name="direction" style={{ transform: props.direction === 'rtl' ? 'scaleX(-1)' : 'none' }} />
        </button>
        <button
          className="tb icon-only"
          onClick={props.onCycleTheme}
          title={t('toolbar.themeTitle', { theme: themeLabel[props.theme] })}
        >
          <Icon name={props.theme === 'dark' ? 'moon' : 'sun'} />
        </button>
        <button className="tb icon-only" onClick={props.onSettings} title={t('toolbar.settingsTitle')}>
          <Icon name="settings" />
        </button>
      </div>
    </div>
  )
}
