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
  const dirty = tab ? tab.content !== tab.savedContent : false

  return (
    <div className="statusbar">
      <div className="status-left">
        <span className="status-chip">{formatCount(words)} كلمة</span>
        <span className="status-chip">{formatCount(lines)} سطر</span>
        <span className="status-chip">{tab?.direction === 'ltr' ? 'LTR' : 'RTL'}</span>
        <span className="status-chip subtle">UTF-8</span>
      </div>

      <div className="status-center">
        {tab ? (
          <span className={`save-state ${dirty ? 'dirty' : 'saved'}`}>
            {dirty ? (autosave ? 'جارٍ الحفظ التلقائي…' : 'تغييرات غير محفوظة') : tab.savedAt ? 'تم الحفظ' : 'جاهز'}
          </span>
        ) : (
          <span className="save-state saved">جاهز</span>
        )}
      </div>

      <div className="status-right">
        {tab?.path ? (
          <button className="path-btn" onClick={() => onShowInFolder(tab.path as string)} title="إظهار الملف في المجلد">
            <Icon name="folder" size={13} />
            <span dir="ltr">{tab.path}</span>
          </button>
        ) : (
          <span className="status-chip subtle">{tab ? 'ملف غير محفوظ' : 'مِداد'}</span>
        )}
      </div>
    </div>
  )
}
