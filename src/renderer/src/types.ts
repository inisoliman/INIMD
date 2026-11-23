import type { Direction } from '@shared/types'
import type { LineRange } from './lib/diff'

export interface TabChange {
  /** نطاقات الأسطر التي أضيفت أو تغيّرت بعد تعديل خارجي. */
  ranges: LineRange[]
  /** وقت انتهاء التظليل (ميلي ثانية). */
  expiresAt: number
  /** وقت حدوث التغيير. */
  at: number
}

export interface Tab {
  id: string
  path: string | null
  name: string
  content: string
  savedContent: string
  mtimeMs: number | null
  direction: Direction
  dirLocked: boolean
  savedAt: number | null
  /** نهاية السطر الأصلية للملف على القرص؛ نعمل داخلياً بـ LF ونعيدها عند الحفظ. */
  eol: Eol
  changes?: TabChange | null
}

/** نهاية السطر في الملف الأصلي. */
export type Eol = '\n' | '\r\n'
