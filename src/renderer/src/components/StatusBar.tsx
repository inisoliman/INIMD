import { useI18n } from '../lib/i18n'
import { formatCount } from '../lib/misc'
import type { Tab } from '../types'
import { Icon } from './Icon'

interface StatusBarProps {
  tab: Tab | null
  words: number
  lines: number
  autosave: boolean
  onShowInFolder: (path: string) => void
}

export function StatusBar({ tab, words, lines, autosave, onShowInFolder }: StatusBarProps): React.ReactElement {
  const { t, language } = useI18n()
  const dirty = tab ? tab.content !== tab.savedContent : false
  const state = dirty
    ? autosave
      ? t('status.saving')
      : t('status.unsaved')
    : tab?.savedAt
      ? t('status.saved')
      : t('status.ready')

  return (
    <div className="statusbar">
      <div className="status-left">
        <span className="status-chip">{t('status.words', { count: formatCount(words, language) })}</span>
        <span className="status-chip">{t('status.lines', { count: formatCount(lines, language) })}</span>
        <span className="status-chip">{tab?.direction === 'ltr' ? 'LTR' : 'RTL'}</span>
        <span className="status-chip subtle">UTF-8</span>
      </div>

      <div className="status-center">
        {tab ? (
          <span className={`save-state ${dirty ? 'dirty' : 'saved'}`}>{state}</span>
        ) : (
          <span className="save-state saved">{t('status.ready')}</span>
        )}
      </div>

      <div className="status-right">
        {tab?.path ? (
          <button
            className="path-btn"
            onClick={() => onShowInFolder(tab.path as string)}
            title={t('status.showInFolder')}
          >
            <Icon name="folder" size={13} />
            <span dir="ltr">{tab.path}</span>
          </button>
        ) : (
          <span className="status-chip subtle">{tab ? t('status.unsavedFile') : 'INIMD'}</span>
        )}
      </div>
    </div>
  )
}
