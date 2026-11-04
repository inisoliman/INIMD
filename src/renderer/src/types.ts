import type { Direction } from '@shared/types'

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
}
