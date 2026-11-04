import { promises as fs } from 'fs'
import { basename, dirname, extname } from 'path'
import type { OpenedFile } from '../shared/types'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx']

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extname(filePath).toLowerCase())
}

export function decodeBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2))
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

export async function readDocument(filePath: string): Promise<OpenedFile> {
  const [stat, buffer] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)])
  if (stat.isDirectory()) throw new Error('المسار يشير إلى مجلد وليس ملفاً')
  return {
    path: filePath,
    name: basename(filePath),
    content: decodeBuffer(buffer),
    mtimeMs: stat.mtimeMs,
    dir: dirname(filePath)
  }
}

export function extractMarkdownArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-')) continue
    const clean = arg.replace(/^"+|"+$/g, '')
    if (isMarkdownPath(clean)) return clean
  }
  return null
}
