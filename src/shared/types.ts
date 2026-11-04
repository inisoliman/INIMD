import type { Language } from './i18n'

export type Direction = 'rtl' | 'ltr'
export type ThemeMode = 'light' | 'dark' | 'system'
export type LayoutMode = 'split' | 'editor' | 'preview'
export type PageSize = 'A4' | 'Letter'
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  | 'disabled'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
  checkedAt?: number
}

export interface Settings {
  language: Language
  theme: ThemeMode
  fontFamily: string
  fontSize: number
  lineHeight: number
  autosave: boolean
  defaultDirection: 'auto' | 'rtl' | 'ltr'
  pageSize: PageSize
  margin: number
  pageNumbers: boolean
  showToc: boolean
  editorWidth: number
  spellcheck: boolean
  autoUpdate: boolean
  updateToken: string
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'ar',
  theme: 'light',
  fontFamily: 'Segoe UI',
  fontSize: 16,
  lineHeight: 1.9,
  autosave: false,
  defaultDirection: 'auto',
  pageSize: 'A4',
  margin: 20,
  pageNumbers: true,
  showToc: true,
  editorWidth: 50,
  spellcheck: true,
  autoUpdate: true,
  updateToken: ''
}

export const FONT_CHOICES = [
  'Segoe UI',
  'Tahoma',
  'Arial',
  'Traditional Arabic',
  'Simplified Arabic',
  'Arabic Typesetting',
  'Amiri',
  'Noto Naskh Arabic',
  'Cairo',
  'Dubai'
]

export interface OpenedFile {
  path: string
  name: string
  content: string
  mtimeMs: number
  dir: string
}

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

export interface FileChange {
  path: string
  mtimeMs: number
}

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface ExportPdfPayload {
  html: string
  defaultName: string
  pageSize: PageSize
  pageNumbers: boolean
  margin: number
  suggestedDir?: string
  language?: Language
}

export interface ExportDocxPayload {
  markdown: string
  baseDir: string
  defaultName: string
  rtl: boolean
  suggestedDir?: string
}

export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'export-docx'
  | 'close-tab'
  | 'toggle-preview'
  | 'toggle-toc'
  | 'find'
  | 'find-preview'
  | 'check-updates'
  | 'settings'
  | 'about'
  | 'guide'

export interface INIMDApi {
  openFile(): Promise<OpenedFile | null>
  openPath(path: string): Promise<OpenedFile>
  readFile(path: string): Promise<OpenedFile>
  saveFile(path: string, content: string): Promise<{ mtimeMs: number }>
  saveFileAs(suggestedName: string, content: string): Promise<{ path: string; mtimeMs: number } | null>
  statFile(path: string): Promise<{ mtimeMs: number; exists: boolean }>
  getSettings(): Promise<Settings>
  setSettings(settings: Settings): Promise<void>
  getRecent(): Promise<RecentFile[]>
  addRecent(path: string): Promise<RecentFile[]>
  clearRecent(): Promise<void>
  exportPdf(payload: ExportPdfPayload): Promise<ExportResult>
  exportDocx(payload: ExportDocxPayload): Promise<ExportResult>
  openExternal(url: string): Promise<void>
  openWithSystem(path: string): Promise<void>
  showItemInFolder(path: string): Promise<void>
  getVersion(): Promise<string>
  checkForUpdates(): Promise<UpdateStatus>
  downloadUpdate(): Promise<UpdateStatus>
  installUpdate(): void
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  watchFile(path: string): Promise<void>
  unwatchFile(path: string): Promise<void>
  onFileChanged(cb: (change: FileChange) => void): () => void
  getPathForFile(file: unknown): string
  onMenu(cb: (action: MenuAction) => void): () => void
  onOpenFile(cb: (file: OpenedFile) => void): () => void
  onBeforeClose(cb: () => void): () => void
  confirmClose(allow: boolean): void
  setSpellcheck(enabled: boolean): void
}
