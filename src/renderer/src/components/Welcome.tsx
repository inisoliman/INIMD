import type { RecentFile } from '@shared/types'
import { relativeTime } from '../lib/misc'
import { Icon } from './Icon'

interface WelcomeProps {
  recent: RecentFile[]
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (path: string) => void
}

export function Welcome({ recent, onNew, onOpen, onOpenRecent }: WelcomeProps): React.ReactElement {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark">م</div>
        <h1>مِداد</h1>
        <p className="welcome-sub">محرر وعارض Markdown عربي، بتصدير مباشر إلى PDF وWord.</p>

        <div className="welcome-actions">
          <button className="primary-btn" onClick={onNew}>
            <Icon name="new" size={17} />
            ملف جديد
          </button>
          <button className="ghost-btn" onClick={onOpen}>
            <Icon name="open" size={17} />
            فتح ملف
          </button>
        </div>

        <div className="welcome-features">
          <div className="feature">
            <span className="feature-icon">↔</span>
            <div>
              <strong>دعم عربي كامل</strong>
              <span>اتجاه RTL تلقائي وخطوط عربية وتصحيح إملائي.</span>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">◫</span>
            <div>
              <strong>معاينة فورية</strong>
              <span>محرر ومعاينة جنباً إلى جنب مع فهرس العناوين.</span>
            </div>
          </div>
          <div className="feature">
            <span className="feature-icon">⇩</span>
            <div>
              <strong>تصدير احترافي</strong>
              <span>PDF بجودة الطباعة وWord قابل للتحرير.</span>
            </div>
          </div>
        </div>

        {recent.length ? (
          <div className="welcome-recent">
            <div className="welcome-recent-head">
              <Icon name="folder" size={15} />
              <span>تابع من حيث توقفت</span>
            </div>
            <div className="welcome-recent-list">
              {recent.slice(0, 6).map((file) => (
                <button key={file.path} className="welcome-recent-item" onClick={() => onOpenRecent(file.path)}>
                  <Icon name="file" size={15} />
                  <span className="recent-name">{file.name}</span>
                  <span className="recent-meta">{relativeTime(file.openedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="welcome-tip">
          اسحب أي ملف <code>.md</code> وأفلته هنا، أو انقر نقراً مزدوجاً على الملف من مستكشف ويندوز بعد التركيب.
        </div>
      </div>
    </div>
  )
}
