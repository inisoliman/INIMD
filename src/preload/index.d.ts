import type { INIMDApi } from '../shared/types'

declare global {
  interface Window {
    api: INIMDApi
  }
}

export {}
