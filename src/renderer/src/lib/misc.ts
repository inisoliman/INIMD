import type { Direction } from '@shared/types'

const ARABIC_RANGE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
const LETTER = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]|[A-Za-z]/

export function detectDirection(text: string, fallback: Direction = 'rtl'): Direction {
  const withoutFrontMatter = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
  const match = withoutFrontMatter.match(LETTER)
  if (!match) return fallback
  return ARABIC_RANGE.test(match[0]) ? 'rtl' : 'ltr'
}

export function countWords(text: string): number {
  if (!text.trim()) return 0
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-|]/g, ' ')
  const words = cleaned.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word))
  return words.length
}

export function countLines(text: string): number {
  return text.length ? text.split(/\r\n|\r|\n/).length : 0
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('ar-EG').format(value)
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (diff < minute) return 'الآن'
  if (diff < hour) return `قبل ${Math.floor(diff / minute)} دقيقة`
  if (diff < day) return `قبل ${Math.floor(diff / hour)} ساعة`
  if (diff < day * 7) return `قبل ${Math.floor(diff / day)} يوم`
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(timestamp)
}

export function makeId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
