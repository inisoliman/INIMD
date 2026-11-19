import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { Direction, Settings } from '@shared/types'
import { isExternalHref } from '../lib/paths'
import { useI18n } from '../lib/i18n'
import { PreviewFind } from './PreviewFind'

interface PreviewPaneProps {
  html: string
  direction: Direction
  settings: Settings
  scrollRef: RefObject<HTMLDivElement | null>
  findOpen: boolean
  onCloseFind: () => void
  onLocalFile: (path: string) => void
  onAnchor: (id: string) => void
  onCopied: () => void
}

interface MenuState {
  x: number
  y: number
  hasSelection: boolean
  link: string | null
  path: string | null
}

/** نسخ نص إلى الحافظة مع بديل احتياطي لا يعتمد على Clipboard API. */
async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* نجرّب الطريقة الاحتياطية */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function PreviewPane({
  html,
  direction,
  settings,
  scrollRef,
  findOpen,
  onCloseFind,
  onLocalFile,
  onAnchor,
  onCopied
}: PreviewPaneProps): React.ReactElement {
  const { t } = useI18n()
  const articleRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const style = {
    '--preview-font': `${settings.fontFamily}, "Segoe UI", Tahoma, sans-serif`,
    '--preview-size': `${settings.fontSize}px`,
    '--preview-lh': String(settings.lineHeight)
  } as CSSProperties

  // إغلاق القائمة عند النقر خارجها أو التمرير أو الضغط على Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    const onScroll = (): void => setMenu(null)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onScroll, { passive: true })
    window.addEventListener('blur', onScroll)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onScroll)
      window.removeEventListener('blur', onScroll)
    }
  }, [menu])

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

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>): void => {
    const article = articleRef.current
    if (!article) return
    const target = event.target as HTMLElement
    const anchor = target.closest('a')
    const selection = window.getSelection()
    const hasSelection = Boolean(
      selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        ((selection.anchorNode && article.contains(selection.anchorNode)) ||
          (selection.focusNode && article.contains(selection.focusNode)))
    )
    event.preventDefault()
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 216),
      y: Math.min(event.clientY, window.innerHeight - 168),
      hasSelection,
      link: anchor?.getAttribute('href') ?? null,
      path: anchor?.getAttribute('data-path') ?? null
    })
  }

  const copySelection = async (): Promise<void> => {
    const text = window.getSelection()?.toString() ?? ''
    setMenu(null)
    if (!text.trim()) return
    if (await copyPlainText(text)) onCopied()
  }

  const copyAll = async (): Promise<void> => {
    const text = articleRef.current?.innerText ?? ''
    setMenu(null)
    if (!text.trim()) return
    if (await copyPlainText(text)) onCopied()
  }

  const copyLink = async (): Promise<void> => {
    const target = menu?.path ?? menu?.link ?? ''
    setMenu(null)
    if (!target.trim()) return
    if (await copyPlainText(target)) onCopied()
  }

  const selectAll = (): void => {
    const article = articleRef.current
    setMenu(null)
    if (!article) return
    const range = document.createRange()
    range.selectNodeContents(article)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return (
    <>
      <PreviewFind containerRef={scrollRef} html={html} open={findOpen} onClose={onCloseFind} />
      <div className="preview-scroll" ref={scrollRef} dir={direction} style={style}>
        {html.trim() ? (
          <article
            className="md-body"
            ref={articleRef}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="preview-empty">
            <p>{t('preview.empty')}</p>
          </div>
        )}
      </div>

      {menu ? (
        <div className="preview-menu" role="menu" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
          <button
            className="preview-menu-item"
            role="menuitem"
            disabled={!menu.hasSelection}
            onClick={() => void copySelection()}
          >
            {t('context.copy')}
          </button>
          <button className="preview-menu-item" role="menuitem" onClick={() => void copyAll()}>
            {t('context.copyAll')}
          </button>
          {menu.link || menu.path ? (
            <button className="preview-menu-item" role="menuitem" onClick={() => void copyLink()}>
              {t('context.copyLink')}
            </button>
          ) : null}
          <div className="preview-menu-sep" />
          <button className="preview-menu-item" role="menuitem" onClick={selectAll}>
            {t('context.selectAll')}
          </button>
        </div>
      ) : null}
    </>
  )
}
