import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'
import type { Direction } from '@shared/types'
import { intersects, type LineRange } from './diff'
import hljs from './highlight'
import { isExternalHref, resolveLocalPath, toAssetUrl } from './paths'

export interface Heading {
  level: number
  text: string
  id: string
}

export interface RenderResult {
  html: string
  headings: Heading[]
  readingMinutes: number
}

interface RenderEnv {
  baseDir: string
  headings: Heading[]
  sequence: number
  changed: LineRange[]
  [key: string]: unknown
}

/** هل يقع هذا البلوك داخل نطاق أسطر تغيّرت مؤخراً؟ */
const isChangedBlock = (env: unknown, token: { map: [number, number] | null }): boolean => {
  const ranges = envOf(env).changed
  if (!ranges || !ranges.length || !token.map) return false
  return intersects(ranges, token.map[0], token.map[1])
}

const envOf = (env: unknown): RenderEnv => env as RenderEnv

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: false
})
  .use(footnote as never)
  .use(taskLists as never, { enabled: false, label: true })

md.renderer.rules.fence = (tokens, idx, options, env) => {
  const token = tokens[idx]
  const info = token.info.trim().split(/\s+/)[0] || ''
  const changed = isChangedBlock(env, token)
  let body: string
  if (info && hljs.getLanguage(info)) {
    try {
      body = hljs.highlight(token.content, { language: info, ignoreIllegals: true }).value
    } catch {
      body = escapeHtml(token.content)
    }
  } else {
    body = escapeHtml(token.content)
  }
  return `<pre class="hljs${changed ? ' md-changed' : ''}" dir="ltr"><code>${body}</code></pre>\n`
}

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const ctx = envOf(env)
  const token = tokens[idx]
  const src = String(token.attrGet('src') ?? '')
  if (src && ctx.baseDir) {
    const resolved = resolveLocalPath(src, ctx.baseDir)
    if (resolved) token.attrSet('src', toAssetUrl(resolved))
  }
  token.attrSet('loading', 'lazy')
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const ctx = envOf(env)
  const token = tokens[idx]
  const href = String(token.attrGet('href') ?? '')
  if (href && !href.startsWith('#') && !isExternalHref(href)) {
    const resolved = resolveLocalPath(href, ctx.baseDir)
    if (resolved) token.attrSet('data-path', resolved)
  }
  if (isExternalHref(href)) {
    token.attrSet('rel', 'noreferrer noopener')
  }
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.table_open = (tokens, idx, options, env) => {
  const changed = isChangedBlock(env, tokens[idx])
  return `<div class="table-wrap${changed ? ' md-changed' : ''}"><table>\n`
}
md.renderer.rules.table_close = () => '</table></div>\n'

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const ctx = envOf(env)
  const token = tokens[idx]
  const inline = tokens[idx + 1]
  const level = Number(token.tag.replace('h', '')) || 1
  const id = `sec-${ctx.sequence}`
  ctx.sequence += 1
  token.attrSet('id', id)

  if (inline) {
    const text = inline.content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    ctx.headings.push({ level, text: text || 'بدون عنوان', id })
  }

  return self.renderToken(tokens, idx, options)
}

// يضيف صنف `md-changed` إلى كل بلوك Markdown يتقاطع مع أسطر تغيّرت خارجياً.
md.core.ruler.push('inimd_changed_blocks', (state) => {
  const ranges = envOf(state.env).changed
  if (!ranges || !ranges.length) return
  for (const token of state.tokens) {
    if (!token.map) continue
    // fence وtable_open لهما قواعد عرض مخصّصة تتعامل مع الصنف بنفسها.
    if (token.type === 'fence' || token.type === 'table_open') continue
    if (intersects(ranges, token.map[0], token.map[1])) token.attrJoin('class', 'md-changed')
  }
})

function decorateTaskLists(html: string): string {
  return html.replace(/<input([^>]*?)class="task-list-item-checkbox"([^>]*?)>/g, (_match, before: string, after: string) => {
    const checked = /\schecked(=|\s|\/|$)/.test(`${before} ${after}`)
    return `<span class="task-box${checked ? ' checked' : ''}" aria-hidden="true">${checked ? '✓' : ''}</span>`
  })
}

export function renderMarkdown(
  source: string,
  options: { baseDir?: string; direction?: Direction; changedLines?: LineRange[] } = {}
): RenderResult {
  const env: RenderEnv = {
    baseDir: options.baseDir ?? '',
    headings: [],
    sequence: 0,
    changed: options.changedLines ?? []
  }

  const raw = decorateTaskLists(md.render(source, env as unknown as never))
  const html = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-path', 'id', 'dir', 'loading'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|inimd|file):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover']
  })

  const words = source.split(/\s+/).filter(Boolean).length
  return {
    html,
    headings: env.headings,
    readingMinutes: Math.max(1, Math.round(words / 180))
  }
}
