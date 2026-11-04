const HIGHLIGHT_ALL = 'inimd-find'
const HIGHLIGHT_ACTIVE = 'inimd-find-active'
const MAX_MATCHES = 2000

interface HighlightRegistry {
  set(name: string, highlight: object): void
  delete(name: string): void
}

type HighlightConstructor = new (...ranges: Range[]) => object

function registry(): HighlightRegistry | null {
  try {
    return (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null
  } catch {
    return null
  }
}

function highlightConstructor(): HighlightConstructor | null {
  return (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight ?? null
}

export function supportsHighlight(): boolean {
  return Boolean(registry() && highlightConstructor())
}

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'])

export function collectMatches(root: HTMLElement, query: string, matchCase: boolean): Range[] {
  const needle = matchCase ? query : query.toLowerCase()
  if (!needle) return []

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || SKIPPED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const matches: Range[] = []
  let node = walker.nextNode()
  while (node && matches.length < MAX_MATCHES) {
    const text = node.nodeValue ?? ''
    const haystack = matchCase ? text : text.toLowerCase()
    let from = haystack.indexOf(needle)
    while (from !== -1 && matches.length < MAX_MATCHES) {
      const range = document.createRange()
      range.setStart(node, from)
      range.setEnd(node, from + needle.length)
      matches.push(range)
      from = haystack.indexOf(needle, from + needle.length)
    }
    node = walker.nextNode()
  }
  return matches
}

export function applyHighlights(matches: Range[], activeIndex: number): void {
  const reg = registry()
  const Highlight = highlightConstructor()
  if (!reg || !Highlight) return
  reg.set(HIGHLIGHT_ALL, new Highlight(...matches))
  const active = matches[activeIndex]
  if (active) reg.set(HIGHLIGHT_ACTIVE, new Highlight(active))
  else reg.delete(HIGHLIGHT_ACTIVE)
}

export function clearHighlights(): void {
  const reg = registry()
  if (!reg) return
  reg.delete(HIGHLIGHT_ALL)
  reg.delete(HIGHLIGHT_ACTIVE)
}

export function revealMatch(container: HTMLElement, range: Range): void {
  const rect = range.getBoundingClientRect()
  const box = container.getBoundingClientRect()
  if (!rect.height && !rect.width) return
  const target = container.scrollTop + (rect.top - box.top) - container.clientHeight / 2 + rect.height / 2
  const top = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, target))
  container.scrollTo({ top, behavior: 'smooth' })
}
