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
  /**
   * فهارس نطاقات التغيير التي لها بلوك ظاهر (أعلى مستوى) في المعاينة،
   * بترتيب المستند. كل عنصر = موضع واحد يتنقّل إليه زر «قراءة التغييرات»،
   * وهو نفسه قيمة `data-change-index` على العنصر الأعلى للبلوك.
   */
  changedBlockRanges: number[]
}

interface RenderEnv {
  baseDir: string
  headings: Heading[]
  sequence: number
  changed: LineRange[]
  changedBlockRanges: number[]
  [key: string]: unknown
}

const envOf = (env: unknown): RenderEnv => env as RenderEnv

/** رقم أول نطاق تغيير يتقاطع مع البلوك، أو -1 إن لم يتغيّر. */
const changeIndexOf = (env: unknown, token: { map: [number, number] | null }): number => {
  const ranges = envOf(env).changed
  if (!ranges || !ranges.length || !token.map) return -1
  for (let index = 0; index < ranges.length; index += 1) {
    if (intersects([ranges[index]], token.map[0], token.map[1])) return index
  }
  return -1
}

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
  const position = token.attrGet('data-change-index')
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
  const attrs =
    position === null
      ? ' class="hljs"'
      : ` class="hljs md-changed" data-change-index="${position}"`
  return `<pre${attrs} dir="ltr"><code>${body}</code></pre>\n`
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
  const position = tokens[idx].attrGet('data-change-index')
  const attrs =
    position === null
      ? ' class="table-wrap"'
      : ` class="table-wrap md-changed" data-change-index="${position}"`
  return `<div${attrs}><table>\n`
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

/**
 * يعلّم كل جزء Markdown يتقاطع مع أسطر تغيّرت خارجياً.
 *
 * - الصنف `md-changed` يُضاف لكل جزء متغيّر (كما في السابق) ليظهر التظليل
 *   نفسه داخل القوائم والجداول والاقتباسات.
 * - الوسم `data-change-index` يُضاف **لعنصر البلوك الأعلى فقط**، لأن التنقل
 *   يحتاج مرساة واحدة لا تتكرر داخل الجدول أو القائمة. القيمة = رقم النطاق
 *   الأصلي، ولا يتكرر الرقم مرتين، فيصبح العدّاد مطابقاً للمواضع القابلة للزيارة.
 */
md.core.ruler.push('inimd_changed_blocks', (state) => {
  const ctx = envOf(state.env)
  if (!ctx.changed.length) return
  for (const token of state.tokens) {
    if (!token.map) continue
    const rangeIndex = changeIndexOf(state.env, token)
    if (rangeIndex < 0) continue
    token.attrJoin('class', 'md-changed')
    // مستوى 0 = بلوك أعلى (فقرة، عنوان، جدول، قائمة، كتلة كود، اقتباس...).
    if (token.level !== 0) continue
    if (token.attrGet('data-change-index') !== null) continue
    // النطاق الواحد قد يغطي بلوكات متجاورة؛ نربطه بأولها كي لا يتكرر العدّ.
    if (ctx.changedBlockRanges.includes(rangeIndex)) continue
    token.attrSet('data-change-index', String(ctx.changedBlockRanges.length))
    ctx.changedBlockRanges.push(rangeIndex)
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
    changed: options.changedLines ?? [],
    changedBlockRanges: []
  }

  const raw = decorateTaskLists(md.render(source, env as unknown as never))
  const html = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-path', 'data-change-index', 'id', 'dir', 'loading'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|inimd|file):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover']
  })

  const words = source.split(/\s+/).filter(Boolean).length
  return {
    html,
    headings: env.headings,
    readingMinutes: Math.max(1, Math.round(words / 180)),
    changedBlockRanges: env.changedBlockRanges
  }
}
