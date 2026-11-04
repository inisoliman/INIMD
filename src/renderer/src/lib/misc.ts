import type { Direction } from '@shared/types'
import { translate, type Language } from '@shared/i18n'

const ARABIC_RANGE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/
const ARABIC_LETTER = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/g
const LATIN_LETTER = /[A-Za-z]/g

/**
 * يحدّد اتجاه المستند من أغلب حروفه الفعلية.
 * يُهمل تنسيق Markdown والروابط والوسوم كي لا يحرف عنوان يبدأ باسم لاتيني
 * (مثل «INIMD») اتجاه مستند عربي بالكامل.
 */
export function detectDirection(text: string, fallback: Direction = 'rtl'): Direction {
  const cleaned = text
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^[#>*_~\-|\s\d.]+/, '')

  const sample = cleaned.slice(0, 400)
  const arabic = sample.match(ARABIC_LETTER)?.length ?? 0
  const latin = sample.match(LATIN_LETTER)?.length ?? 0
  if (!arabic && !latin) return fallback
  return arabic >= latin ? 'rtl' : 'ltr'
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

export function formatCount(value: number, language: Language = 'ar'): string {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-US').format(value)
}

export function relativeTime(timestamp: number, language: Language = 'ar'): string {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000
  if (diff < minute) return translate(language, 'time.now')
  if (diff < hour) return translate(language, 'time.minutes', { count: Math.floor(diff / minute) })
  if (diff < day) return translate(language, 'time.hours', { count: Math.floor(diff / hour) })
  if (diff < day * 7) return translate(language, 'time.days', { count: Math.floor(diff / day) })
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(
    timestamp
  )
}

export function makeId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
