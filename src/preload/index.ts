import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ExportDocxPayload,
  ExportPdfPayload,
  MenuAction,
  INIMDApi,
  OpenedFile,
  Settings
} from '../shared/types'

const api: INIMDApi = {
  openFile: () => ipcRenderer.invoke('dialog:open'),
  openPath: (path: string): Promise<OpenedFile> => ipcRenderer.invoke('file:read', path),
  readFile: (path: string): Promise<OpenedFile> => ipcRenderer.invoke('file:read', path),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),
  saveFileAs: (suggestedName: string, content: string) =>
    ipcRenderer.invoke('file:save-as', suggestedName, content),
  statFile: (path: string) => ipcRenderer.invoke('file:stat', path),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Settings) => ipcRenderer.invoke('settings:set', settings),
  getRecent: () => ipcRenderer.invoke('recent:get'),
  addRecent: (path: string) => ipcRenderer.invoke('recent:add', path),
  clearRecent: () => ipcRenderer.invoke('recent:clear'),
  exportPdf: (payload: ExportPdfPayload) => ipcRenderer.invoke('export:pdf', payload),
  exportDocx: (payload: ExportDocxPayload) => ipcRenderer.invoke('export:docx', payload),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openWithSystem: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item', path),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPathForFile: (file: unknown) => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  },
  onMenu: (cb: (action: MenuAction) => void) => {
    const listener = (_event: unknown, action: MenuAction): void => cb(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
  onOpenFile: (cb: (file: OpenedFile) => void) => {
    const listener = (_event: unknown, file: OpenedFile): void => cb(file)
    ipcRenderer.on('app:open-file', listener)
    return () => ipcRenderer.removeListener('app:open-file', listener)
  },
  onBeforeClose: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  },
  confirmClose: (allow: boolean) => ipcRenderer.send('app:confirm-close', allow),
  setSpellcheck: (enabled: boolean) => ipcRenderer.send('spellcheck:set', enabled)
}

contextBridge.exposeInMainWorld('api', api)
