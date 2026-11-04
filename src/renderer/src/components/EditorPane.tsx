import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { tags } from '@lezer/highlight'
import type { Settings } from '@shared/types'
import type { Tab } from '../types'

const ARABIC_PHRASES: Record<string, string> = {
  Find: 'بحث',
  Replace: 'استبدال',
  next: 'التالي',
  previous: 'السابق',
  all: 'الكل',
  'match case': 'مطابقة الحالة',
  'by word': 'كلمة كاملة',
  regexp: 'تعبير نمطي',
  replace: 'استبدال',
  'replace all': 'استبدال الكل',
  close: 'إغلاق',
  'current match': 'المطابقة الحالية',
  'replaced $ matches': 'تم استبدال $ مطابقة',
  'replaced match on line $': 'تم استبدال مطابقة في السطر $',
  'on line': 'في السطر',
  'Go to line': 'انتقل إلى السطر',
  'go to line': 'انتقل إلى السطر'
}

const inimdTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-fg)',
    fontSize: 'var(--editor-size)',
    fontFamily: 'var(--editor-font)',
    lineHeight: 'var(--editor-lh)'
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'auto'
  },
  '.cm-content': {
    padding: '20px 24px',
    caretColor: 'var(--accent)'
  },
  '.cm-line': { padding: '0' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-gutter)',
    color: 'var(--muted)',
    border: 'none',
    borderInlineEnd: '1px solid var(--border)',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: '12px'
  },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection) !important'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-panels': {
    backgroundColor: 'var(--panel)',
    color: 'var(--fg)',
    borderColor: 'var(--border)',
    fontFamily: 'var(--ui-font)'
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '8px 10px', direction: 'rtl' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
    fontFamily: 'var(--ui-font)',
    fontSize: '12px'
  },
  '.cm-textfield': {
    backgroundColor: 'var(--input-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 8px'
  },
  '.cm-button': {
    backgroundColor: 'var(--button-bg)',
    backgroundImage: 'none',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 10px'
  },
  '.cm-searchMatch': { backgroundColor: 'var(--match)', outline: '1px solid var(--match-border)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--match-active)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--panel)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '8px'
  }
})

const inimdHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--syn-heading)', fontWeight: '700', fontSize: '1.35em' },
  { tag: tags.heading2, color: 'var(--syn-heading)', fontWeight: '700', fontSize: '1.2em' },
  { tag: tags.heading3, color: 'var(--syn-heading)', fontWeight: '700', fontSize: '1.1em' },
  { tag: tags.heading4, color: 'var(--syn-heading)', fontWeight: '600' },
  { tag: tags.heading5, color: 'var(--syn-heading)', fontWeight: '600' },
  { tag: tags.heading6, color: 'var(--syn-heading)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700', color: 'var(--syn-strong)' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--syn-em)' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--syn-url)' },
  { tag: tags.monospace, fontFamily: 'Consolas, "Courier New", monospace', color: 'var(--syn-code)' },
  { tag: tags.quote, color: 'var(--syn-quote)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--syn-list)' },
  { tag: tags.contentSeparator, color: 'var(--syn-sep)' },
  { tag: tags.meta, color: 'var(--syn-meta)' },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--syn-keyword)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syn-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syn-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className], color: 'var(--syn-type)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-func)' },
  { tag: tags.tagName, color: 'var(--syn-tag)' },
  { tag: tags.attributeName, color: 'var(--syn-attr)' },
  { tag: tags.variableName, color: 'var(--syn-var)' }
])

interface EditorPaneProps {
  tab: Tab
  settings: Settings
  onChange: (value: string) => void
  onScrollRatio: (ratio: number) => void
  onViewReady: (view: EditorView | null) => void
}

export function EditorPane({ tab, settings, onChange, onScrollRatio, onViewReady }: EditorPaneProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  const scrollRef = useRef(onScrollRatio)
  const readyRef = useRef(onViewReady)

  changeRef.current = onChange
  scrollRef.current = onScrollRatio
  readyRef.current = onViewReady

  useEffect(() => {
    if (!hostRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: tab.content,
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          EditorView.lineWrapping,
          EditorState.phrases.of(ARABIC_PHRASES),
          inimdTheme,
          syntaxHighlighting(inimdHighlight),
          EditorView.contentAttributes.of({
            spellcheck: settings.spellcheck ? 'true' : 'false',
            autocorrect: 'off',
            autocapitalize: 'off'
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeRef.current(update.state.doc.toString())
          })
        ]
      }),
      parent: hostRef.current
    })

    viewRef.current = view
    readyRef.current(view)

    const handleScroll = (): void => {
      const el = view.scrollDOM
      const max = el.scrollHeight - el.clientHeight
      scrollRef.current(max > 0 ? el.scrollTop / max : 0)
    }
    view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true })

    const timer = window.setTimeout(() => view.focus(), 30)

    return () => {
      window.clearTimeout(timer)
      view.scrollDOM.removeEventListener('scroll', handleScroll)
      readyRef.current(null)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== tab.content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: tab.content }
      })
    }
  }, [tab.content])

  useEffect(() => {
    viewRef.current?.requestMeasure()
  }, [tab.direction])

  const style = {
    '--editor-font': `${settings.fontFamily}, "Segoe UI", Tahoma, sans-serif`,
    '--editor-size': `${settings.fontSize}px`,
    '--editor-lh': String(settings.lineHeight)
  } as CSSProperties

  return <div className="editor-host" dir={tab.direction} style={style} ref={hostRef} />
}
