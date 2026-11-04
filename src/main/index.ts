import { app, BrowserWindow, dialog, Menu, ipcMain, net, protocol, shell } from 'electron'
import { watch as watchFs, type FSWatcher } from 'fs'
import { promises as fs } from 'fs'
import { dirname, extname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import type { ExportDocxPayload, ExportPdfPayload, MenuAction, Settings } from '../shared/types'
import { createTranslator, type Language } from '../shared/i18n'
import { buildDocxFile } from './docx'
import { extractMarkdownArg, isMarkdownPath, readDocument } from './files'
import { exportPdf } from './pdf'
import { addRecent, clearRecent, getRecent, getSettings, saveSettings } from './store'
import { checkForUpdates, downloadUpdate, getUpdateStatus, initUpdater, installUpdate } from './updater'

const APP_ID = 'com.ini.inimd'

function markdownFilters(filtersName: string, allName: string): Electron.FileFilter[] {
  return [
    { name: filtersName, extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
    { name: allName, extensions: ['*'] }
  ]
}

let menuLanguage: Language | null = null

let mainWindow: BrowserWindow | null = null
let forceClose = false
let closeRequested = false
let pendingOpenPath: string | null = null

app.setAppUserModelId(APP_ID)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'inimd',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif', '.ico'])

async function registerAssetProtocol(): Promise<void> {
  protocol.handle('inimd', async (request) => {
    try {
      const url = new URL(request.url)
      const target = url.searchParams.get('path')
      if (!target) return new Response('Not found', { status: 404 })
      const absolute = resolve(target)
      if (!IMAGE_EXTENSIONS.has(extname(absolute).toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      return await net.fetch(pathToFileURL(absolute).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const target = extractMarkdownArg(argv)
    focusMainWindow()
    if (target) openPathInWindow(target)
  })
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(__dirname, '../../resources')
}

function iconPath(): string {
  return join(resourcesDir(), 'icon.ico')
}

async function openPathInWindow(filePath: string): Promise<void> {
  try {
    const file = await readDocument(filePath)
    await addRecent(file.path)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:open-file', file)
    }
  } catch (error) {
    if (mainWindow) {
      const settings = await getSettings()
      const t = createTranslator(settings.language)
      dialog.showErrorBox(t('dialog.openErrorTitle'), error instanceof Error ? error.message : String(error))
    }
  }
}

function sendMenu(action: MenuAction): void {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow
  target?.webContents.send('menu:action', action)
}

function buildMenu(language: Language, force = false): void {
  if (!force && menuLanguage === language) return
  menuLanguage = language
  const t = createTranslator(language)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.new'), accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
        { type: 'separator' },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: t('menu.exportPdf'), accelerator: 'CmdOrCtrl+Alt+P', click: () => sendMenu('export-pdf') },
        { label: t('menu.exportWord'), accelerator: 'CmdOrCtrl+Alt+W', click: () => sendMenu('export-docx') },
        { type: 'separator' },
        { label: t('menu.closeTab'), accelerator: 'CmdOrCtrl+W', click: () => sendMenu('close-tab') },
        {
          label: t('menu.quit'),
          accelerator: 'Alt+F4',
          click: () => mainWindow?.close()
        }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), role: 'undo' },
        { label: t('menu.redo'), role: 'redo' },
        { type: 'separator' },
        { label: t('menu.cut'), role: 'cut' },
        { label: t('menu.copy'), role: 'copy' },
        { label: t('menu.paste'), role: 'paste' },
        { label: t('menu.selectAll'), role: 'selectAll' },
        { type: 'separator' },
        { label: t('menu.find'), accelerator: 'CmdOrCtrl+F', click: () => sendMenu('find') }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { label: t('menu.togglePreview'), accelerator: 'CmdOrCtrl+Shift+V', click: () => sendMenu('toggle-preview') },
        { label: t('menu.sidebar'), accelerator: 'CmdOrCtrl+B', click: () => sendMenu('toggle-toc') },
        { type: 'separator' },
        { label: t('menu.zoomIn'), role: 'zoomIn' },
        { label: t('menu.zoomOut'), role: 'zoomOut' },
        { label: t('menu.zoomReset'), role: 'resetZoom' },
        { type: 'separator' },
        { label: t('menu.fullscreen'), role: 'togglefullscreen' },
        { label: t('menu.devtools'), role: 'toggleDevTools' }
      ]
    },
    {
      label: t('menu.settings'),
      submenu: [
        { label: t('menu.appSettings'), accelerator: 'CmdOrCtrl+,', click: () => sendMenu('settings') },
        { label: t('menu.checkUpdates'), click: () => sendMenu('check-updates') }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.guide'), click: () => sendMenu('guide') },
        {
          label: t('menu.about'),
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: t('menu.aboutTitle'),
              message: `INIMD ${app.getVersion()}`,
              detail: t('menu.aboutDetail'),
              buttons: [t('menu.ok')]
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#fbf9f4',
    title: 'INIMD',
    icon: iconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    try {
      mainWindow?.webContents.session.setSpellCheckerLanguages(['ar', 'en-US'])
    } catch {
      /* dictionaries may be unavailable */
    }
    if (pendingOpenPath) {
      const target = pendingOpenPath
      pendingOpenPath = null
      void openPathInWindow(target)
    }
  })

  mainWindow.on('close', (event) => {
    if (forceClose) return
    event.preventDefault()
    if (closeRequested) return
    closeRequested = true
    mainWindow?.webContents.send('app:before-close')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? ''
    if (url !== current) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async () => {
    if (!mainWindow) return null
    const settings = await getSettings()
    const t = createTranslator(settings.language)
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('dialog.openTitle'),
      properties: ['openFile'],
      filters: markdownFilters(t('dialog.markdownFiles'), t('dialog.allFiles'))
    })
    if (result.canceled || !result.filePaths.length) return null
    const file = await readDocument(result.filePaths[0])
    await addRecent(file.path)
    return file
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      const t = createTranslator((await getSettings()).language)
      throw new Error(t('dialog.invalidPath'))
    }
    const absolute = resolve(filePath)
    const file = await readDocument(absolute)
    await addRecent(file.path)
    return file
  })

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      const t = createTranslator((await getSettings()).language)
      throw new Error(t('dialog.invalidPath'))
    }
    await fs.writeFile(filePath, content, 'utf8')
    const stat = await fs.stat(filePath)
    await addRecent(filePath)
    return { mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('file:save-as', async (_event, suggestedName: string, content: string) => {
    if (!mainWindow) return null
    const settings = await getSettings()
    const t = createTranslator(settings.language)
    const suggested = await defaultDocumentPath(suggestedName)
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('dialog.saveTitle'),
      defaultPath: suggested,
      filters: markdownFilters(t('dialog.markdownFiles'), t('dialog.allFiles'))
    })
    if (result.canceled || !result.filePath) return null
    const target = isMarkdownPath(result.filePath) ? result.filePath : `${result.filePath}.md`
    await fs.writeFile(target, content, 'utf8')
    const stat = await fs.stat(target)
    await addRecent(target)
    return { path: target, mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
      return { mtimeMs: stat.mtimeMs, exists: stat.isFile() }
    } catch {
      return { mtimeMs: 0, exists: false }
    }
  })

  ipcMain.handle('settings:get', async () => getSettings())

  ipcMain.handle('settings:set', async (_event, patch: Partial<Settings>) => {
    const before = await getSettings()
    const next = await saveSettings(patch ?? {})
    if (next.language !== before.language) buildMenu(next.language)
    return next
  })

  ipcMain.handle('file:watch', async (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath) watchFile(filePath)
  })

  ipcMain.handle('file:unwatch', async (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath) unwatchFile(filePath)
  })

  ipcMain.handle('recent:get', async () => getRecent())
  ipcMain.handle('recent:add', async (_event, filePath: string) => addRecent(filePath))
  ipcMain.handle('recent:clear', async () => clearRecent())

  ipcMain.handle('export:pdf', async (_event, payload: ExportPdfPayload) => {
    if (!mainWindow) {
      const t = createTranslator((await getSettings()).language)
      return { ok: false, error: t('dialog.noWindow') }
    }
    const settings = await getSettings()
    const suggestedDir = payload.suggestedDir || (await lastDirectory())
    return exportPdf(
      mainWindow,
      { ...payload, pageSize: payload.pageSize || settings.pageSize },
      suggestedDir
    )
  })

  ipcMain.handle('export:docx', async (_event, payload: ExportDocxPayload) => {
    if (!mainWindow) {
      const t = createTranslator((await getSettings()).language)
      return { ok: false, error: t('dialog.noWindow') }
    }
    try {
      const settings = await getSettings()
      const t = createTranslator(settings.language)
      const suggestedDir = payload.suggestedDir || payload.baseDir || (await lastDirectory())
      let targetPath = process.env['INIMD_DOCX_OUT'] ?? ''
      if (!targetPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: t('dialog.exportWordTitle'),
          defaultPath: join(suggestedDir, `${payload.defaultName}.docx`),
          filters: [{ name: t('dialog.wordDoc'), extensions: ['docx'] }]
        })
        if (result.canceled || !result.filePath) return { ok: false, canceled: true }
        targetPath = result.filePath
      }
      const buffer = await buildDocxFile(payload, settings.fontFamily)
      await fs.mkdir(dirname(targetPath), { recursive: true }).catch(() => undefined)
      await fs.writeFile(targetPath, buffer)
      return { ok: true, path: targetPath }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return
    if (/^(https?:|mailto:)/i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle('shell:open-path', async (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath) await shell.openPath(filePath)
  })

  ipcMain.handle('shell:show-item', async (_event, filePath: string) => {
    if (typeof filePath === 'string' && filePath) shell.showItemInFolder(filePath)
  })

  ipcMain.handle('app:version', async () => app.getVersion())

  ipcMain.handle('update:check', async () => checkForUpdates())
  ipcMain.handle('update:download', async () => downloadUpdate())
  ipcMain.on('update:install', () => installUpdate())
  ipcMain.handle('update:status', async () => getUpdateStatus())

  ipcMain.on('app:confirm-close', (_event, allow: boolean) => {
    closeRequested = false
    if (allow) {
      forceClose = true
      mainWindow?.close()
    }
  })

  ipcMain.on('spellcheck:set', (_event, enabled: boolean) => {
    mainWindow?.webContents.session.setSpellCheckerEnabled(Boolean(enabled))
  })
}

let cachedDirectory: string | null = null

interface PathWatcher {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
}

const fileWatchers = new Map<string, PathWatcher>()

function watcherKey(filePath: string): string {
  return resolve(filePath).toLowerCase()
}

function watchFile(filePath: string): void {
  const key = watcherKey(filePath)
  if (fileWatchers.has(key)) return
  try {
    const watcher = watchFs(filePath, { persistent: false }, () => {
      const entry = fileWatchers.get(key)
      if (!entry) return
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        void (async () => {
          try {
            const stat = await fs.stat(filePath)
            if (!stat.isFile()) return
            mainWindow?.webContents.send('app:file-changed', {
              path: filePath,
              mtimeMs: stat.mtimeMs
            })
          } catch {
            /* file may be mid-write or removed */
          }
        })()
      }, 220)
      entry.timer.unref?.()
    })
    watcher.on('error', () => unwatchFile(filePath))
    fileWatchers.set(key, { watcher, timer: null })
  } catch {
    /* watching is best effort */
  }
}

function unwatchFile(filePath: string): void {
  const key = watcherKey(filePath)
  const entry = fileWatchers.get(key)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  try {
    entry.watcher.close()
  } catch {
    /* ignore */
  }
  fileWatchers.delete(key)
}

async function lastDirectory(): Promise<string> {
  if (cachedDirectory) return cachedDirectory
  cachedDirectory = app.getPath('documents')
  return cachedDirectory
}

async function defaultDocumentPath(suggestedName: string): Promise<string> {
  const dir = await lastDirectory()
  return join(dir, suggestedName.toLowerCase().endsWith('.md') ? suggestedName : `${suggestedName}.md`)
}

async function runSelfTest(): Promise<void> {
  const outDir = join(app.getPath('temp'), 'inimd-selftest')
  await fs.mkdir(outDir, { recursive: true })
  const markdown = `# اختبار INIMD

هذا ملف تجريبي **بخط عريض** و*مائل* و\`كود\`.

## جدول

| العمود | القيمة |
|---|---|
| عربي | ١٢٣ |
| English | 456 |

- عنصر أول
- عنصر ثانٍ
  - عنصر متداخل

> اقتباس بالعربية.

\`\`\`ts
const greeting = "مرحبا"
\`\`\`
`
  const docx = await buildDocxFile(
    { markdown, baseDir: outDir, defaultName: 'selftest', rtl: true, suggestedDir: outDir },
    'Segoe UI'
  )
  await fs.writeFile(join(outDir, 'selftest.docx'), docx)

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  const html = `<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; font-size: 14pt; line-height: 1.9 }
    h1 { color: #0f5132 } table { border-collapse: collapse; width: 100% } td, th { border: 1px solid #ccc; padding: 6px }
  </style><body><h1>اختبار تصدير PDF</h1><p>نص عربي مع English words و 1234.</p>
  <table><tr><th>العمود</th><th>القيمة</th></tr><tr><td>عربي</td><td>١٢٣</td></tr></table></body></html>`
  const htmlPath = join(outDir, 'selftest.html')
  await fs.writeFile(htmlPath, html, 'utf8')
  await win.loadFile(htmlPath)
  await new Promise((r) => setTimeout(r, 300))
  const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  await fs.writeFile(join(outDir, 'selftest.pdf'), pdf)
  win.destroy()

  const docxStat = await fs.stat(join(outDir, 'selftest.docx'))
  const pdfStat = await fs.stat(join(outDir, 'selftest.pdf'))
  console.log(`SELFTEST_OK docx=${docxStat.size} pdf=${pdfStat.size} dir=${outDir}`)
}

app.whenReady().then(async () => {
  await registerAssetProtocol()
  registerIpc()

  const settings = await getSettings()
  buildMenu(settings.language)
  initUpdater((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:status', status)
    }
  })

  if (process.argv.includes('--selftest')) {
    try {
      await runSelfTest()
    } catch (error) {
      console.error('SELFTEST_FAIL', error)
    }
    app.quit()
    return
  }

  const initialPath = extractMarkdownArg(process.argv)
  if (initialPath) pendingOpenPath = initialPath

  createWindow()

  if (settings.autoUpdate) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) void checkForUpdates()
    }, 6000).unref?.()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
