import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useI18n } from '../lib/i18n'
import { applyHighlights, clearHighlights, collectMatches, revealMatch } from '../lib/find'
import { Icon } from './Icon'

interface PreviewFindProps {
  containerRef: RefObject<HTMLDivElement | null>
  html: string
  open: boolean
  onClose: () => void
}

export function PreviewFind({ containerRef, html, open, onClose }: PreviewFindProps): React.ReactElement | null {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matches, setMatches] = useState<Range[]>([])
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [open])

  useEffect(() => {
    if (!open || !containerRef.current) {
      clearHighlights()
      setMatches([])
      setIndex(0)
      return
    }
    const found = query.trim() ? collectMatches(containerRef.current, query.trim(), matchCase) : []
    setMatches(found)
    setIndex(0)
  }, [query, matchCase, html, open, containerRef])

  useEffect(() => {
    if (!open || !matches.length) {
      clearHighlights()
      return
    }
    const active = Math.min(index, matches.length - 1)
    applyHighlights(matches, active)
    if (containerRef.current) revealMatch(containerRef.current, matches[active])
  }, [matches, index, open, containerRef])

  useEffect(() => {
    return () => clearHighlights()
  }, [])

  if (!open) return null

  const total = matches.length
  const active = total ? Math.min(index, total - 1) : 0

  const step = (delta: number): void => {
    if (!total) return
    setIndex((prev) => (prev + delta + total) % total)
  }

  const counter = query.trim() ? (total ? t('find.count', { current: active + 1, total }) : t('find.noResults')) : ''

  return (
    <div
      className="preview-find"
      role="search"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="preview-find-input">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t('find.placeholder')}
          aria-label={t('find.placeholder')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              step(event.shiftKey ? -1 : 1)
            }
          }}
        />
      </div>

      <span className={`preview-find-count ${query.trim() && !total ? 'empty' : ''}`}>{counter}</span>

      <button
        type="button"
        className={`find-case ${matchCase ? 'active' : ''}`}
        title={t('find.matchCase')}
        aria-pressed={matchCase}
        onClick={() => setMatchCase((prev) => !prev)}
      >
        Aa
      </button>
      <button type="button" className="icon-btn" title={t('find.prev')} disabled={!total} onClick={() => step(-1)}>
        <Icon name="chevronUp" size={15} />
      </button>
      <button type="button" className="icon-btn" title={t('find.next')} disabled={!total} onClick={() => step(1)}>
        <Icon name="chevronDown" size={15} />
      </button>
      <button type="button" className="icon-btn" title={t('find.close')} onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
