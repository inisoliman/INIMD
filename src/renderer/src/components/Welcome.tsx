import type { RecentFile } from '@shared/types'
import { useI18n } from '../lib/i18n'
import { relativeTime } from '../lib/misc'
import { Icon } from './Icon'

interface WelcomeProps {
  recent: RecentFile[]
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (path: string) => void
}

export function Welcome({ recent, onNew, onOpen, onOpenRecent }: WelcomeProps): React.ReactElement {
  const { t, language } = useI18n()

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark">INI</div>
        <h1>INIMD</h1>
        <p className="welcome-sub">{t('welcome.sub')}</p>

        <div className="welcome-actions">
          <button className="primary-btn" onClick={onNew}>
            <Icon name="new" size={17} />
            {t('welcome.newFile')}
          </button>
          <button className="ghost-btn" onClick={onOpen}>
            <Icon name="open" size={17} />
            {t('welcome.openFile')}
          </button>
        </div>

        <div className="welcome-features">
          <div className="feature">
            <span className="feature-icon">↔</span>
            <div>
              <strong>{t('welcome.feature1Title')}</strong>
              <span>{t('welcome.feature1Body')}</span>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">◫</span>
            <div>
              <strong>{t('welcome.feature2Title')}</strong>
              <span>{t('welcome.feature2Body')}</span>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">⇩</span>
            <div>
              <strong>{t('welcome.feature3Title')}</strong>
              <span>{t('welcome.feature3Body')}</span>
            </div>
          </div>
        </div>

        {recent.length ? (
          <div className="welcome-recent">
            <div className="welcome-recent-head">
              <Icon name="folder" size={15} />
              <span>{t('welcome.continue')}</span>
            </div>
            <div className="welcome-recent-list">
              {recent.slice(0, 6).map((file) => (
                <button key={file.path} className="welcome-recent-item" onClick={() => onOpenRecent(file.path)}>
                  <Icon name="file" size={15} />
                  <span className="recent-name">{file.name}</span>
                  <span className="recent-meta">{relativeTime(file.openedAt, language)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="welcome-tip">{t('welcome.tip')}</div>
      </div>
    </div>
  )
}
