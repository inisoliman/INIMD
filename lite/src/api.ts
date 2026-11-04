import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  DEFAULT_SETTINGS,
  type ExportDocxPayload,
  type ExportPdfPayload,
  type ExportResult,
  type FileChange,
  type INIMDApi,
  type MenuAction,
  type OpenedFile,
  type RecentFile,
  type Settings,
  type UpdateStatus
} from '@shared/types'
import type { DocxEnv } from '@shared/docx'

const openFileListeners = new Set<(file: OpenedFile) => void>()
let pendingStartupFile: OpenedFile | null = null

function emitOpenFile(file: OpenedFile): void {
  if (openFileListeners.size === 0) {
    pendingStartupFile = file
    return
  }
  for (const listener of openFileListeners) listener(file)
}

/** يحوّل روابط الأصول (asset protocol) إلى مسارات file:// قبل تصدير PDF. */
function localizeAssetUrls(html: string): string {
  return html.replace(/http:\/\/asset\.localhost\/([^"'\s>)]+)/g, (_match, encoded: string) => {
    let decoded = encoded
    try {
      decoded = decodeURIComponent(encoded)
    } catch {
      /* keep the raw value */
    }
    const normalized = decoded.replace(/\\/g, '/')
    return `file:///${normalized
      .replace(/ /g, '%20')
      .replace(/#/g, '%23')
      .replace(/\?/g, '%3F')}`
  })
}

async function readSettings(): Promise<Settings> {
  try {
    return await invoke<Settings>('get_settings')
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function currentFontFamily(): Promise<string> {
  const settings = await readSettings()
  return settings.fontFamily
}

const docxEnv: DocxEnv = {
  readFile: async (path: string) => {
    const bytes = await invoke<number[]>('read_bytes', { path })
    return Uint8Array.from(bytes)
  },
  pack: async (doc) => {
    const blob = await (await import('docx')).Packer.toBlob(doc)
    return new Uint8Array(await blob.arrayBuffer())
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number(part) || 0)
  const pb = b.split(/[.-]/).map((part) => Number(part) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

interface GitHubRelease {
  tag_name?: string
  html_url?: string
  prerelease?: boolean
  assets?: { name?: string; browser_download_url?: string }[]
}

let liteReleaseUrl = 'https://github.com/inisoliman/INIMD/releases'
let liteReleaseAsset = ''

async function checkForUpdates(): Promise<UpdateStatus> {
  const settings = await readSettings()
  if (!settings.autoUpdate) return { state: 'disabled', message: 'disabled' }

  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const token = settings.updateToken || ''
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const response = await fetch('https://api.github.com/repos/inisoliman/INIMD/releases?per_page=30', {
      headers
    })
    if (!response.ok) throw new Error(`GitHub ${response.status}`)
    const releases = (await response.json()) as GitHubRelease[]
    const lite = releases
      .filter((item) => (item.tag_name ?? '').startsWith('lite-v'))
      .sort((a, b) => compareVersions(a.tag_name ?? '', b.tag_name ?? ''))
      .pop()
    const current = await invoke<string>('get_version')
    if (!lite?.tag_name) return { state: 'not-available', version: current, checkedAt: Date.now() }

    const latest = lite.tag_name.replace(/^lite-v/, '')
    liteReleaseUrl = lite.html_url ?? liteReleaseUrl
    const asset = (lite.assets ?? []).find((entry) => /setup/i.test(entry.name ?? ''))
    liteReleaseAsset = asset?.browser_download_url ?? ''

    if (compareVersions(latest, current) > 0) {
      return { state: 'available', version: latest, checkedAt: Date.now() }
    }
    return { state: 'not-available', version: current, checkedAt: Date.now() }
  } catch (error) {
    return {
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
      checkedAt: Date.now()
    }
  }
}

export function createApi(): INIMDApi {
  const api: INIMDApi = {
    openFile: () => invoke<OpenedFile | null>('open_file_dialog'),
    openPath: (path) => invoke<OpenedFile>('open_path', { path }),
    readFile: (path) => invoke<OpenedFile>('read_doc', { path }),
    saveFile: (path, content) => invoke<{ mtimeMs: number }>('save_file', { path, content }),
    saveFileAs: (suggestedName, content) =>
      invoke<{ path: string; mtimeMs: number } | null>('save_file_as', { suggestedName, content }),
    statFile: (path) => invoke<{ mtimeMs: number; exists: boolean }>('stat_file', { path }),

    getSettings: () => invoke<Settings>('get_settings'),
    setSettings: async (settings) => {
      await invoke('set_settings', { settings })
    },
    getRecent: () => invoke<RecentFile[]>('get_recent'),
    addRecent: (path) => invoke<RecentFile[]>('add_recent', { path }),
    clearRecent: async () => {
      await invoke('clear_recent')
    },

    exportPdf: async (payload: ExportPdfPayload): Promise<ExportResult> => {
      try {
        return await invoke<ExportResult>('export_pdf', {
          payload: { ...payload, html: localizeAssetUrls(payload.html) }
        })
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },

    exportDocx: async (payload: ExportDocxPayload): Promise<ExportResult> => {
      try {
        const target = await invoke<string | null>('pick_save_path', {
          suggestedName: `${payload.defaultName}.docx`,
          extension: 'docx',
          dir: payload.suggestedDir ?? payload.baseDir ?? ''
        })
        if (!target) return { ok: false, canceled: true }
        const { buildDocxFile } = await import('@shared/docx')
        const bytes = await buildDocxFile(payload, await currentFontFamily(), docxEnv)
        await invoke('write_bytes', { path: target, bytes: Array.from(bytes) })
        return { ok: true, path: target }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },

    openExternal: async (url) => {
      await invoke('open_external', { url })
    },
    openWithSystem: async (path) => {
      await invoke('open_with_system', { path })
    },
    showItemInFolder: async (path) => {
      await invoke('show_in_folder', { path })
    },
    getVersion: () => invoke<string>('get_version'),

    checkForUpdates,
    downloadUpdate: async (): Promise<UpdateStatus> => {
      await invoke('open_external', { url: liteReleaseAsset || liteReleaseUrl })
      return { state: 'available', version: '', checkedAt: Date.now() }
    },
    installUpdate: () => {
      void invoke('open_external', { url: liteReleaseUrl })
    },
    onUpdateStatus: () => () => undefined,

    watchFile: async (path) => {
      await invoke('watch_file', { path })
    },
    unwatchFile: async (path) => {
      await invoke('unwatch_file', { path })
    },
    onFileChanged: (cb) => {
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen<FileChange>('file-changed', (event) => cb(event.payload)).then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      return () => {
        disposed = true
        unlisten?.()
      }
    },

    getPathForFile: () => '',

    onMenu: (cb) => {
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen<string>('menu', (event) => cb(event.payload as MenuAction)).then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      return () => {
        disposed = true
        unlisten?.()
      }
    },
    onOpenFile: (cb) => {
      openFileListeners.add(cb)
      if (pendingStartupFile) {
        const file = pendingStartupFile
        pendingStartupFile = null
        cb(file)
      }
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen<OpenedFile>('open-file', (event) => cb(event.payload)).then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      return () => {
        disposed = true
        openFileListeners.delete(cb)
        unlisten?.()
      }
    },
    onBeforeClose: (cb) => {
      let disposed = false
      let unlisten: (() => void) | null = null
      void listen('before-close', () => cb()).then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      return () => {
        disposed = true
        unlisten?.()
      }
    },
    confirmClose: (allow) => {
      void invoke('confirm_close', { allow })
    },
    setSpellcheck: () => undefined
  }

  return api
}

export function installApi(): void {
  const api = createApi()
  ;(window as unknown as { api: INIMDApi }).api = api
}

/** يسلّم الملف الذي فُتح من سطر الأوامر أو من ربط الملفات بعد تحميل الواجهة. */
export function installStartupFile(): void {
  void invoke<OpenedFile | null>('take_startup_file')
    .then((file) => {
      if (file) emitOpenFile(file)
    })
    .catch(() => undefined)
}

export function installDragAndDrop(): void {
  void getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const path = event.payload.paths[0]
    if (!path) return
    void invoke<OpenedFile>('open_path', { path })
      .then((file) => emitOpenFile(file))
      .catch(() => undefined)
  })
}
