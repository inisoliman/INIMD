import type { MidadApi } from '../shared/types'

declare global {
  interface Window {
    api: MidadApi
  }
}

export {}
