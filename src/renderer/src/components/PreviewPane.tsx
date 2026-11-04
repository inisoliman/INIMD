import type { CSSProperties, RefObject } from 'react'
import type { Direction, Settings } from '@shared/types'
import { isExternalHref } from '../lib/paths'

interface PreviewPaneProps {
  html: string
  direction: Direction
  settings: Settings
  scrollRef: RefObject<HTMLDivElement | null>
  onLocalFile: (path: string) => void
  onAnchor: (id: string) => void
}

export function PreviewPane({
  html,
  direction,
  settings,
  scrollRef,
  onLocalFile,
  onAnchor
}: PreviewPaneProps): React.ReactElement {
  const style = {
    '--preview-font': `${settings.fontFamily}, "Segoe UI", Tahoma, sans-serif`,
    '--preview-size': `${settings.fontSize}px`,
    '--preview-lh': String(settings.lineHeight)
  } as CSSProperties

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    event.preventDefault()

    const localPath = anchor.getAttribute('data-path')
    if (localPath) {
      onLocalFile(localPath)
      return
    }

    const href = anchor.getAttribute('href') ?? ''
    if (href.startsWith('#')) {
      onAnchor(href.slice(1))
      return
    }
    if (isExternalHref(href)) {
      void window.api.openExternal(href)
    }
  }

  return (
    <div className="preview-scroll" ref={scrollRef} dir={direction} style={style}>
      {html.trim() ? (
        <article className="md-body" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="preview-empty">
          <p>لا يوجد محتوى بعد — ابدأ الكتابة في المحرر وستظهر المعاينة هنا.</p>
        </div>
      )}
    </div>
  )
}
