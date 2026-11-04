import MarkdownIt from 'markdown-it'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from 'docx'
import type { ExportDocxPayload } from './types'

export interface DocxEnv {
  readFile(path: string): Promise<Uint8Array>
  pack(doc: Document): Promise<Uint8Array>
}

interface MdToken {
  type: string
  tag: string
  attrs: [string, string][] | null
  content: string
  children: MdToken[] | null
  level: number
  hidden: boolean
  markup: string
  info: string
}

type Block = Paragraph | Table

interface Ctx {
  rtl: boolean
  baseDir: string
  font: string
  size: number
  indent: number
  quote: number
  listDepth: number
  pendingPrefix?: string
  env: DocxEnv
}

interface RunStyle {
  bold?: boolean
  italics?: boolean
  size?: number
  color?: string
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]
const HEADING_SIZES = [36, 32, 28, 26, 24, 22]
const BULLETS = ['•', '◦', '▪']

function getAttr(token: MdToken, name: string): string | null {
  if (!token.attrs) return null
  const found = token.attrs.find((entry) => entry[0] === name)
  return found ? found[1] : null
}

function findMatching(tokens: MdToken[], start: number, openType: string, closeType: string): number {
  let depth = 0
  for (let i = start; i < tokens.length; i += 1) {
    if (tokens[i].type === openType) depth += 1
    else if (tokens[i].type === closeType) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return tokens.length - 1
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

interface ImageInfo {
  data: Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  width: number
  height: number
}

const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/

function decodeBase64(input: string): Uint8Array {
  const binary = globalThis.atob(input)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function resolveImagePath(src: string, baseDir: string): string | null {
  let raw = src
  if (/^file:\/\//i.test(raw)) {
    try {
      raw = decodeURIComponent(raw.replace(/^file:\/\/\/?/i, ''))
    } catch {
      /* keep raw */
    }
  } else {
    try {
      raw = decodeURIComponent(raw)
    } catch {
      /* keep raw */
    }
  }
  if (WINDOWS_DRIVE.test(raw)) return raw.replace(/\//g, '\\')
  if (raw.startsWith('/') && /^\/[A-Za-z]:\//.test(raw)) return raw.slice(1).replace(/\//g, '\\')
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  if (!baseDir) return null
  const parts = `${baseDir.replace(/\\/g, '/')}/${raw.replace(/\\/g, '/')}`.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (stack.length) stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('\\')
}

function detectImage(buffer: Uint8Array): { type: ImageInfo['type']; width: number; height: number } | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { type: 'png', width: view.getUint32(16, false), height: view.getUint32(20, false) }
  }
  if (buffer.length > 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { type: 'gif', width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (buffer.length > 26 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { type: 'bmp', width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) }
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      const length = view.getUint16(offset + 2, false)
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return {
          type: 'jpg',
          height: view.getUint16(offset + 5, false),
          width: view.getUint16(offset + 7, false)
        }
      }
      offset += 2 + length
    }
  }
  return null
}

async function loadImage(src: string, baseDir: string, env: DocxEnv): Promise<ImageInfo | null> {
  try {
    if (!src || /^https?:\/\//i.test(src)) return null

    let buffer: Uint8Array
    if (src.startsWith('data:image/')) {
      const comma = src.indexOf(',')
      if (comma < 0) return null
      if (!src.slice(0, comma).includes('base64')) return null
      buffer = decodeBase64(src.slice(comma + 1))
    } else {
      const absolute = resolveImagePath(src, baseDir)
      if (!absolute) return null
      buffer = await env.readFile(absolute)
    }

    const info = detectImage(buffer)
    if (!info || !info.width || !info.height) return null
    return { data: buffer, type: info.type, width: info.width, height: info.height }
  } catch {
    return null
  }
}

function imageRun(info: ImageInfo): ImageRun {
  const maxWidth = 560
  const scale = info.width > maxWidth ? maxWidth / info.width : 1
  const width = Math.max(24, Math.round(info.width * scale))
  const height = Math.max(24, Math.round(info.height * scale))
  return new ImageRun({
    data: info.data,
    transformation: { width, height },
    type: info.type
  })
}

/* ------------------------------------------------------------------ */
/* Inline rendering                                                    */
/* ------------------------------------------------------------------ */

type InlineChild = TextRun | ExternalHyperlink | ImageRun

async function renderInline(token: MdToken, ctx: Ctx, base: RunStyle = {}): Promise<InlineChild[]> {
  const out: InlineChild[] = []
  const children = token.children ?? []

  let bold = false
  let italics = false
  let strike = false
  let linkHref: string | null = null
  let linkRuns: TextRun[] = []

  const makeRun = (text: string, extra: Partial<{ font: string; shading: boolean }> = {}): TextRun => {
    const runBold = base.bold || bold
    const runItalics = base.italics || italics
    const size = base.size ?? ctx.size
    return new TextRun({
      text,
      bold: runBold,
      boldComplexScript: runBold,
      italics: runItalics,
      italicsComplexScript: runItalics,
      strike,
      rightToLeft: extra.font ? false : ctx.rtl,
      font: extra.font ?? ctx.font,
      size,
      sizeComplexScript: size,
      color: base.color,
      underline: linkHref ? { type: 'single', color: '2E6DB4' } : undefined
    })
  }

  const push = (child: InlineChild): void => {
    if (linkHref) {
      if (child instanceof TextRun) linkRuns.push(child)
      else {
        flushLink()
        out.push(child)
      }
      return
    }
    out.push(child)
  }

  const flushLink = (): void => {
    if (!linkHref) return
    const isExternal = /^[a-z]+:/i.test(linkHref) || linkHref.startsWith('//')
    const childrenRuns = linkRuns.length ? linkRuns : [makeRun(linkHref)]
    if (isExternal) {
      out.push(new ExternalHyperlink({ link: linkHref, children: childrenRuns }))
    } else {
      out.push(...childrenRuns)
    }
    linkHref = null
    linkRuns = []
  }

  for (const child of children) {
    switch (child.type) {
      case 'text':
        push(makeRun(child.content))
        break
      case 'strong_open':
        bold = true
        break
      case 'strong_close':
        bold = false
        break
      case 'em_open':
        italics = true
        break
      case 'em_close':
        italics = false
        break
      case 's_open':
        strike = true
        break
      case 's_close':
        strike = false
        break
      case 'code_inline':
        push(makeRun(child.content, { font: 'Consolas' }))
        break
      case 'link_open':
        linkHref = getAttr(child, 'href') ?? ''
        linkRuns = []
        break
      case 'link_close':
        flushLink()
        break
      case 'image': {
        const src = getAttr(child, 'src') ?? ''
        const alt = child.content || getAttr(child, 'alt') || ''
        const info = await loadImage(src, ctx.baseDir, ctx.env)
        if (info) push(imageRun(info))
        else if (alt) push(makeRun(`[صورة: ${alt}]`, { font: ctx.font }))
        break
      }
      case 'softbreak':
        push(makeRun(' '))
        break
      case 'hardbreak':
        out.push(
          new TextRun({
            text: '',
            break: 1,
            rightToLeft: ctx.rtl,
            font: ctx.font,
            size: base.size ?? ctx.size
          })
        )
        break
      case 'html_inline':
        break
      default:
        if (child.content) push(makeRun(child.content))
        break
    }
  }

  flushLink()
  return out
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function paragraphOptions(ctx: Ctx, prefix?: string): Record<string, unknown> {
  return {
    bidirectional: ctx.rtl,
    alignment: ctx.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 40, after: 120, line: 320, lineRule: LineRuleType.AUTO },
    indent:
      ctx.indent > 0 || prefix
        ? { left: ctx.indent + (prefix ? 260 : 0), hanging: prefix ? 260 : undefined }
        : undefined,
    border: ctx.quote
      ? {
          right: ctx.rtl
            ? { style: BorderStyle.SINGLE, size: 12, color: 'C7CFCB', space: 8 }
            : undefined,
          left: ctx.rtl
            ? undefined
            : { style: BorderStyle.SINGLE, size: 12, color: 'C7CFCB', space: 8 }
        }
      : undefined
  }
}

async function paragraphFromInline(
  inline: MdToken,
  ctx: Ctx,
  opts: { heading?: number; prefix?: string } = {}
): Promise<Paragraph> {
  const prefix = opts.prefix ?? ctx.pendingPrefix
  const base: RunStyle =
    opts.heading !== undefined
      ? { bold: true, size: HEADING_SIZES[opts.heading - 1], color: '14231F' }
      : {}

  const runs = await renderInline(inline, ctx, base)
  const children: InlineChild[] = []
  if (prefix) {
    children.push(
      new TextRun({
        text: `${prefix}\u00A0`,
        rightToLeft: ctx.rtl,
        font: ctx.font,
        size: opts.heading ? HEADING_SIZES[opts.heading - 1] : ctx.size,
        bold: opts.heading !== undefined,
        boldComplexScript: opts.heading !== undefined
      })
    )
  }
  children.push(...runs)

  return new Paragraph({
    ...paragraphOptions(ctx, prefix),
    heading: opts.heading !== undefined ? HEADING_LEVELS[opts.heading - 1] : undefined,
    children
  })
}

function codeBlock(content: string, ctx: Ctx): Paragraph {
  const lines = content.replace(/\n+$/, '').split('\n')
  const children: TextRun[] = []
  lines.forEach((line, index) => {
    children.push(
      new TextRun({
        text: line.length ? line : ' ',
        font: 'Consolas',
        size: 18,
        sizeComplexScript: 18,
        rightToLeft: false,
        break: index === 0 ? 0 : 1
      })
    )
  })

  return new Paragraph({
    bidirectional: false,
    alignment: AlignmentType.LEFT,
    spacing: { before: 80, after: 120, line: 240, lineRule: LineRuleType.AUTO },
    indent: { left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'F3F4F3', color: 'auto' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E1E4E2', space: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E1E4E2', space: 4 },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E1E4E2', space: 6 },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E1E4E2', space: 6 }
    },
    children
  })
}

function horizontalRule(ctx: Ctx): Paragraph {
  return new Paragraph({
    bidirectional: ctx.rtl,
    spacing: { before: 160, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: 'D6DBD9', space: 1 }
    },
    children: []
  })
}

async function renderBlocks(tokens: MdToken[], ctx: Ctx): Promise<Block[]> {
  const blocks: Block[] = []
  const local: Ctx = { ...ctx }
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    if (token.type === 'heading_open') {
      const inline = tokens[i + 1]
      const level = Math.min(6, Math.max(1, Number(token.tag.replace('h', '')) || 1))
      if (inline) blocks.push(await paragraphFromInline(inline, local, { heading: level }))
      local.pendingPrefix = undefined
      i += 3
      continue
    }

    if (token.type === 'paragraph_open') {
      const inline = tokens[i + 1]
      if (inline) blocks.push(await paragraphFromInline(inline, local))
      local.pendingPrefix = undefined
      i += 3
      continue
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      blocks.push(codeBlock(token.content, local))
      local.pendingPrefix = undefined
      i += 1
      continue
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const nested = await renderList(tokens, i, local)
      blocks.push(...nested.blocks)
      local.pendingPrefix = undefined
      i = nested.next
      continue
    }

    if (token.type === 'blockquote_open') {
      const end = findMatching(tokens, i, 'blockquote_open', 'blockquote_close')
      const inner = await renderBlocks(tokens.slice(i + 1, end), {
        ...local,
        quote: local.quote + 1,
        indent: local.indent + 380,
        pendingPrefix: undefined
      })
      blocks.push(...inner)
      local.pendingPrefix = undefined
      i = end + 1
      continue
    }

    if (token.type === 'table_open') {
      const end = findMatching(tokens, i, 'table_open', 'table_close')
      blocks.push(await renderTable(tokens.slice(i + 1, end), local))
      local.pendingPrefix = undefined
      i = end + 1
      continue
    }

    if (token.type === 'hr') {
      blocks.push(horizontalRule(local))
      local.pendingPrefix = undefined
      i += 1
      continue
    }

    if (token.type === 'inline') {
      blocks.push(await paragraphFromInline(token, local))
      local.pendingPrefix = undefined
      i += 1
      continue
    }

    if (token.type === 'html_block') {
      local.pendingPrefix = undefined
      i += 1
      continue
    }

    i += 1
  }

  return blocks
}

async function renderList(
  tokens: MdToken[],
  openIndex: number,
  ctx: Ctx
): Promise<{ blocks: Block[]; next: number }> {
  const open = tokens[openIndex]
  const ordered = open.type === 'ordered_list_open'
  const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close'
  const start = Number(getAttr(open, 'start') ?? 1) || 1
  const blocks: Block[] = []
  let index = openIndex + 1
  let number = start

  while (index < tokens.length && tokens[index].type !== closeType) {
    if (tokens[index].type === 'list_item_open') {
      const end = findMatching(tokens, index, 'list_item_open', 'list_item_close')
      const prefix = ordered ? `${number}.` : BULLETS[Math.min(ctx.listDepth, BULLETS.length - 1)]
      const inner = await renderBlocks(tokens.slice(index + 1, end), {
        ...ctx,
        indent: ctx.indent + 300,
        listDepth: ctx.listDepth + 1,
        pendingPrefix: prefix
      })
      if (!inner.length) {
        inner.push(
          new Paragraph({
            ...paragraphOptions(ctx, prefix),
            children: [
              new TextRun({
                text: `${prefix}\u00A0`,
                rightToLeft: ctx.rtl,
                font: ctx.font,
                size: ctx.size
              })
            ]
          })
        )
      }
      blocks.push(...inner)
      number += 1
      index = end + 1
      continue
    }
    index += 1
  }

  return { blocks, next: index + 1 }
}

async function renderTable(tokens: MdToken[], ctx: Ctx): Promise<Table> {
  const rows: TableRow[] = []
  let index = 0

  while (index < tokens.length) {
    if (tokens[index].type !== 'tr_open') {
      index += 1
      continue
    }

    const rowEnd = findMatching(tokens, index, 'tr_open', 'tr_close')
    const cells: TableCell[] = []
    let cursor = index + 1

    while (cursor < rowEnd) {
      const cellToken = tokens[cursor]
      if (cellToken.type === 'th_open' || cellToken.type === 'td_open') {
        const isHeader = cellToken.type === 'th_open'
        const inline = tokens[cursor + 1]
        const align = getAttr(cellToken, 'style') ?? ''
        const runs = inline ? await renderInline(inline, ctx, isHeader ? { bold: true, size: ctx.size - 2 } : { size: ctx.size - 2 }) : []

        const alignment = align.includes('center')
          ? AlignmentType.CENTER
          : align.includes('right')
            ? AlignmentType.RIGHT
            : ctx.rtl
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT

        cells.push(
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            shading: isHeader ? { type: ShadingType.CLEAR, fill: 'EFF3F1', color: 'auto' } : undefined,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                bidirectional: ctx.rtl,
                alignment,
                spacing: { before: 20, after: 20 },
                children: runs.length ? runs : [new TextRun({ text: '' })]
              })
            ]
          })
        )
        cursor += 3
        continue
      }
      cursor += 1
    }

    if (cells.length) rows.push(new TableRow({ children: cells, tableHeader: false }))
    index = rowEnd + 1
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: ctx.rtl,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D5DAD8' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D5DAD8' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D5DAD8' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D5DAD8' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E6E4' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E6E4' }
    },
    rows
  })
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export async function buildDocxFile(
  payload: ExportDocxPayload,
  fontFamily: string | undefined,
  env: DocxEnv
): Promise<Uint8Array> {
  const font = fontFamily || 'Segoe UI'
  const rtl = payload.rtl
  const ctx: Ctx = {
    rtl,
    baseDir: payload.baseDir,
    font,
    size: 22,
    indent: 0,
    quote: 0,
    listDepth: 0,
    env
  }

  const tokens = md.parse(payload.markdown, {}) as unknown as MdToken[]
  const children = await renderBlocks(tokens, ctx)
  if (!children.length) children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))

  const headingStyle = (size: number) => ({
    run: { size, bold: true, boldComplexScript: true, color: '14231F', font, rightToLeft: rtl },
    paragraph: {
      spacing: { before: 280, after: 140, line: 300, lineRule: LineRuleType.AUTO },
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT
    }
  })

  const doc = new Document({
    creator: 'INIMD',
    title: payload.defaultName,
    description: `تم التصدير من INIMD`,
    styles: {
      default: {
        document: {
          run: { font, size: 22, sizeComplexScript: 22, rightToLeft: rtl, color: '1B2320' },
          paragraph: {
            spacing: { before: 40, after: 120, line: 320, lineRule: LineRuleType.AUTO },
            alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT
          }
        },
        heading1: headingStyle(36),
        heading2: headingStyle(32),
        heading3: headingStyle(28),
        heading4: headingStyle(26),
        heading5: headingStyle(24),
        heading6: headingStyle(22)
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567 }
          }
        },
        children
      }
    ]
  })

  return env.pack(doc)
}

export async function exportDocxFile(
  payload: ExportDocxPayload,
  fontFamily: string | undefined,
  env: DocxEnv
): Promise<Uint8Array> {
  return buildDocxFile(payload, fontFamily, env)
}
