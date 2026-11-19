import { useEffect, useRef } from 'react'
import type { Heading } from '../lib/markdown'
import { useI18n } from '../lib/i18n'
import { relativeTime } from '../lib/misc'
import type { RecentFile } from '@shared/types'
import { Icon } from './Icon'

interface SidebarProps {
  headings: Heading[]
  recent: RecentFile[]
  activeHeadingId: string | null
  onHeading: (id: string) => void
  onOpenRecent: (path: string) => void
  onClearRecent: () => void
  onShowInFolder: (path: string) => void
}

export function Sidebar({
  headings,
  recent,
  activeHeadingId,
  onHeading,
  onOpenRecent,
  onClearRecent,
  onShowInFolder
}: SidebarProps): React.ReactElement {
  const { t, language } = useI18n()
  const navRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)

  // يُبقي البند النشط ظاهراً داخل الفهرس عند التمرير في ملف طويل.
  useEffect(() => {
    const nav = navRef.current
    const active = activeRef.current
    if (!nav || !active) return
    const navRect = nav.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    if (activeRect.top < navRect.top) nav.scrollTop -= navRect.top - activeRect.top + 6
    else if (activeRect.bottom > navRect.bottom) nav.scrollTop += activeRect.bottom - navRect.bottom + 6
  }, [activeHeadingId])

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Icon name="file" size={15} />
        <span>{t('sidebar.contents')}</span>
        <span className="counter">{headings.length || ''}</span>
      </div>

      {headings.length ? (
        <nav className="toc" aria-label={t('sidebar.tocAria')} ref={navRef}>
          {headings.map((heading) => (
            <button
              key={heading.id}
              ref={activeHeadingId === heading.id ? activeRef : undefined}
              className={`toc-item level-${heading.level} ${activeHeadingId === heading.id ? 'active' : ''}`}
              onClick={() => onHeading(heading.id)}
              title={heading.text}
              aria-current={activeHeadingId === heading.id ? 'location' : undefined}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      ) : (
        <div className="sidebar-empty">{t('sidebar.emptyToc')}</div>
      )}

      <div className="sidebar-head recent-head">
        <Icon name="folder" size={15} />
        <span>{t('sidebar.recent')}</span>
        {recent.length ? (
          <button className="link-btn" onClick={onClearRecent} title={t('sidebar.clear')}>
            <Icon name="trash" size={13} />
          </button>
        ) : null}
      </div>

      {recent.length ? (
        <div className="recent-list">
          {recent.map((file) => (
            <div key={file.path} className="recent-item">
              <button className="recent-open" onClick={() => onOpenRecent(file.path)} title={file.path}>
                <span className="recent-name">{file.name}</span>
                <span className="recent-meta">{relativeTime(file.openedAt, language)}</span>
              </button>
              <button
                className="recent-locate"
                title={t('status.showInFolder')}
                onClick={() => onShowInFolder(file.path)}
              >
                <Icon name="external" size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="sidebar-empty">{t('sidebar.emptyRecent')}</div>
      )}
    </aside>
  )
}
