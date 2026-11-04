import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { openSearchPanel } from '@codemirror/search'
import type { EditorView } from '@codemirror/view'
import {
  DEFAULT_SETTINGS,
  type Direction,
  type FileChange,
  type LayoutMode,
  type MenuAction,
  type OpenedFile,
  type RecentFile,
  type Settings,
  type ThemeMode,
  type UpdateStatus
} from '@shared/types'
import { createTranslator, type TFunction } from '@shared/i18n'
import { EditorPane } from './components/EditorPane'
import { GuideDialog } from './components/GuideDialog'
import { Icon } from './components/Icon'
import { ConfirmDialog, type DialogButton } from './components/Modal'
import { PreviewPane } from './components/PreviewPane'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { Toolbar } from './components/Toolbar'
import { Welcome } from './components/Welcome'
import { I18nProvider } from './lib/i18n'
import { renderMarkdown } from './lib/markdown'
import { baseNameOf, dirnameOf, stripExtension } from './lib/paths'
import { countLines, countWords, detectDirection, makeId } from './lib/misc'
import { buildPrintDocument } from './lib/print'
import type { Tab } from './types'

interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'error'
}

interface DialogState {
  title: string
  message: string
  buttons: DialogButton[]
}

const MD_PATTERN = /\.(md|markdown|mdown|mkd|mdx)$/i

function emptyTab(index: number, direction: Direction, t: TFunction): Tab {
  return {
    id: makeId(),
    path: null,
    name: t('app.untitled', { n: index }),
    content: '',
    savedContent: '',
    mtimeMs: null,
    direction,
    dirLocked: false,
    savedAt: null
  }
}

export default function App(): React.ReactElement {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [version, setVersion] = useState('')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [layout, setLayout] = useState<LayoutMode>('split')
  const [sidebar, setSidebar] = useState(true)
  const [editorWidth, setEditorWidth] = useState(50)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [loaded, setLoaded] = useState(false)

  const tabsRef = useRef<Tab[]>([])
  const activeIdRef = useRef<string | null>(null)
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const panesRef = useRef<HTMLDivElement | null>(null)
  const layoutRef = useRef<LayoutMode>('split')
  const untitledCounter = useRef(1)
  const toastTimers = useRef<number[]>([])
  const editorWidthRef = useRef(50)
  const watchedRef = useRef<Set<string>>(new Set())

  const t = useMemo(() => createTranslator(settings.language), [settings.language])
  const tRef = useRef(t)
  tRef.current = t

  tabsRef.current = tabs
  activeIdRef.current = activeId
  settingsRef.current = settings
  editorWidthRef.current = editorWidth
  layoutRef.current = layout

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null
  const deferredContent = useDeferredValue(activeTab?.content ?? '')

  const rendered = useMemo(
    () =>
      renderMarkdown(deferredContent, {
        baseDir: activeTab?.path ? dirnameOf(activeTab.path) : '',
        direction: activeTab?.direction ?? 'rtl'
      }),
    [deferredContent, activeTab?.path, activeTab?.direction]
  )

  const words = useMemo(() => countWords(activeTab?.content ?? ''), [activeTab?.content])
  const lines = useMemo(() => countLines(activeTab?.content ?? ''), [activeTab?.content])

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = makeId()
    setToasts((prev) => [...prev, { id, text, kind }])
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4200)
    toastTimers.current.push(timer)
  }, [])

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await window.api.getRecent())
    } catch {
      /* ignore */
    }
  }, [])

  /* -------------------------------------------------------------- */
  /* Boot                                                           */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [savedSettings, savedRecent, appVersion] = await Promise.all([
          window.api.getSettings(),
          window.api.getRecent(),
          window.api.getVersion()
        ])
        if (!mounted) return
        setSettings(savedSettings)
        settingsRef.current = savedSettings
        setRecent(savedRecent)
        setVersion(appVersion)
      } finally {
        if (mounted) setLoaded(true)
      }
    })()

    try {
      const storedLayout = localStorage.getItem('inimd:layout') as LayoutMode | null
      if (storedLayout === 'split' || storedLayout === 'editor' || storedLayout === 'preview') setLayout(storedLayout)
      const storedSidebar = localStorage.getItem('inimd:sidebar')
      if (storedSidebar !== null) setSidebar(storedSidebar === 'true')
    } catch {
      /* ignore */
    }

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('inimd:layout', layout)
      localStorage.setItem('inimd:sidebar', String(sidebar))
    } catch {
      /* ignore */
    }
  }, [layout, sidebar])

  /* -------------------------------------------------------------- */
  /* Language + theme                                               */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    document.documentElement.lang = settings.language
    document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr'
  }, [settings.language])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  useEffect(() => {
    if (!loaded) return
    window.api.setSpellcheck(settings.spellcheck)
  }, [settings.spellcheck, loaded])

  useEffect(() => {
    setEditorWidth(settings.editorWidth)
  }, [settings.editorWidth])

  useEffect(() => {
    document.title = activeTab ? `${activeTab.name} — INIMD` : 'INIMD'
  }, [activeTab?.name])

  /* -------------------------------------------------------------- */
  /* Updates                                                        */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const off = window.api.onUpdateStatus((status) => {
      setUpdateStatus(status)
      const translate = tRef.current
      if (status.state === 'downloaded' && status.version) {
        notify(translate('update.downloaded', { version: status.version }), 'success')
      } else if (status.state === 'available' && status.version) {
        notify(translate('update.available', { version: status.version }), 'info')
      } else if (status.state === 'error' && status.message) {
        notify(translate('update.error', { error: status.message }), 'error')
      }
    })
    return off
  }, [notify])

  /* -------------------------------------------------------------- */
  /* Settings                                                       */
  /* -------------------------------------------------------------- */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettings(next)
    void window.api.setSettings(next)
  }, [])

  /* -------------------------------------------------------------- */
  /* Tabs                                                           */
  /* -------------------------------------------------------------- */
  const addFromOpened = useCallback(
    (file: OpenedFile) => {
      const existing = tabsRef.current.find(
        (tab) => tab.path && tab.path.toLowerCase() === file.path.toLowerCase()
      )
      if (existing) {
        setActiveId(existing.id)
        return
      }
      const direction: Direction =
        settingsRef.current.defaultDirection === 'auto'
          ? detectDirection(file.content)
          : settingsRef.current.defaultDirection
      const tab: Tab = {
        id: makeId(),
        path: file.path,
        name: file.name,
        content: file.content,
        savedContent: file.content,
        mtimeMs: file.mtimeMs,
        direction,
        dirLocked: settingsRef.current.defaultDirection !== 'auto',
        savedAt: null
      }
      setTabs((prev) => [...prev, tab])
      setActiveId(tab.id)
      void refreshRecent()
    },
    [refreshRecent]
  )

  const openPath = useCallback(
    async (path: string) => {
      try {
        const file = await window.api.openPath(path)
        addFromOpened(file)
      } catch (error) {
        notify(
          tRef.current('app.openFailed', { error: error instanceof Error ? error.message : String(error) }),
          'error'
        )
      }
    },
    [addFromOpened, notify]
  )

  const openDialog = useCallback(async () => {
    try {
      const file = await window.api.openFile()
      if (file) addFromOpened(file)
    } catch (error) {
      notify(
        tRef.current('app.openFailed', { error: error instanceof Error ? error.message : String(error) }),
        'error'
      )
    }
  }, [addFromOpened, notify])

  const newTab = useCallback(() => {
    const direction: Direction =
      settingsRef.current.defaultDirection === 'auto' ? 'rtl' : settingsRef.current.defaultDirection
    const tab = emptyTab(untitledCounter.current, direction, tRef.current)
    untitledCounter.current += 1
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
  }, [])

  const closeNow = useCallback((id: string) => {
    const list = tabsRef.current
    const index = list.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const next = list.filter((tab) => tab.id !== id)
    setTabs(next)
    if (activeIdRef.current === id) {
      const fallback = next[Math.min(index, next.length - 1)]
      setActiveId(fallback ? fallback.id : null)
    }
  }, [])

  const saveTab = useCallback(
    async (id: string, forceAs = false): Promise<boolean> => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return false
      try {
        if (!tab.path || forceAs) {
          const suggestion = tab.path ? baseNameOf(tab.path) : `${tab.name}`
          const result = await window.api.saveFileAs(suggestion, tab.content)
          if (!result) return false
          setTabs((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    path: result.path,
                    name: baseNameOf(result.path),
                    savedContent: tab.content,
                    mtimeMs: result.mtimeMs,
                    savedAt: Date.now()
                  }
                : item
            )
          )
          void refreshRecent()
          notify(tRef.current('app.savedAs', { name: baseNameOf(result.path) }), 'success')
        } else {
          const result = await window.api.saveFile(tab.path, tab.content)
          setTabs((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, savedContent: tab.content, mtimeMs: result.mtimeMs, savedAt: Date.now() }
                : item
            )
          )
        }
        return true
      } catch (error) {
        notify(
          tRef.current('app.saveFailed', { error: error instanceof Error ? error.message : String(error) }),
          'error'
        )
        return false
      }
    },
    [notify, refreshRecent]
  )

  const saveAll = useCallback(async (): Promise<boolean> => {
    for (const tab of [...tabsRef.current]) {
      if (tab.content === tab.savedContent) continue
      const ok = await saveTab(tab.id)
      if (!ok) return false
    }
    return true
  }, [saveTab])

  const requestClose = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return
      if (tab.content === tab.savedContent) {
        closeNow(id)
        return
      }
      const translate = tRef.current
      setDialog({
        title: translate('app.unsavedTitle'),
        message: translate('app.unsavedMessage', { name: tab.name }),
        buttons: [
          {
            label: translate('app.saveAndClose'),
            kind: 'primary',
            action: () => {
              void saveTab(id).then((ok) => {
                if (ok) closeNow(id)
              })
            }
          },
          { label: translate('app.discardChanges'), kind: 'danger', action: () => closeNow(id) },
          { label: translate('app.cancel'), kind: 'ghost', action: () => undefined }
        ]
      })
    },
    [closeNow, saveTab]
  )

  const updateContent = useCallback((id: string, content: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== id) return tab
        let direction = tab.direction
        if (!tab.dirLocked && !tab.content.trim() && content.trim()) {
          direction = detectDirection(content, tab.direction)
        }
        return { ...tab, content, direction }
      })
    )
  }, [])

  const toggleDirection = useCallback(() => {
    if (!activeIdRef.current) return
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeIdRef.current
          ? { ...tab, direction: tab.direction === 'rtl' ? 'ltr' : 'rtl', dirLocked: true }
          : tab
      )
    )
  }, [])

  /* -------------------------------------------------------------- */
  /* External file changes (any other editor)                       */
  /* -------------------------------------------------------------- */
  const applyDiskContent = useCallback((tabId: string, file: OpenedFile) => {
    setTabs((prev) =>
      prev.map((item) =>
        item.id === tabId
          ? { ...item, content: file.content, savedContent: file.content, mtimeMs: file.mtimeMs }
          : item
      )
    )
  }, [])

  const handleFileChange = useCallback(
    async (change: FileChange) => {
      const tab = tabsRef.current.find(
        (item) => item.path && item.path.toLowerCase() === change.path.toLowerCase()
      )
      if (!tab) return
      if (change.mtimeMs <= (tab.mtimeMs ?? 0) + 5) return
      try {
        const file = await window.api.readFile(change.path)
        const current = tabsRef.current.find((item) => item.id === tab.id)
        if (!current) return
        if (file.content === current.content) {
          setTabs((prev) =>
            prev.map((item) => (item.id === current.id ? { ...item, mtimeMs: file.mtimeMs } : item))
          )
          return
        }
        if (current.content === current.savedContent) {
          applyDiskContent(current.id, file)
          notify(tRef.current('app.fileChangedOutside'), 'info')
          return
        }
        const translate = tRef.current
        setDialog({
          title: translate('app.externalChangeTitle'),
          message: translate('app.externalChangeMessage', { name: current.name }),
          buttons: [
            {
              label: translate('app.reloadFile'),
              kind: 'primary',
              action: () => applyDiskContent(current.id, file)
            },
            {
              label: translate('app.keepMine'),
              kind: 'ghost',
              action: () =>
                setTabs((prev) =>
                  prev.map((item) => (item.id === current.id ? { ...item, mtimeMs: file.mtimeMs } : item))
                )
            }
          ]
        })
      } catch {
        /* file may have vanished */
      }
    },
    [applyDiskContent, notify]
  )

  const pathsKey = useMemo(
    () =>
      tabs
        .map((tab) => tab.path ?? '')
        .filter(Boolean)
        .join('\u0000'),
    [tabs]
  )

  useEffect(() => {
    const next = new Set(pathsKey ? pathsKey.split('\u0000') : [])
    for (const path of next) {
      if (!watchedRef.current.has(path)) {
        watchedRef.current.add(path)
        void window.api.watchFile(path)
      }
    }
    for (const path of Array.from(watchedRef.current)) {
      if (!next.has(path)) {
        watchedRef.current.delete(path)
        void window.api.unwatchFile(path)
      }
    }
  }, [pathsKey])

  useEffect(() => {
    const off = window.api.onFileChanged((change) => {
      void handleFileChange(change)
    })
    return off
  }, [handleFileChange])

  /* -------------------------------------------------------------- */
  /* Autosave                                                       */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!settings.autosave || !activeTab?.path) return
    if (activeTab.content === activeTab.savedContent) return
    const id = activeTab.id
    const timer = window.setTimeout(() => {
      void saveTab(id)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [activeTab?.content, activeTab?.id, activeTab?.path, activeTab?.savedContent, settings.autosave, saveTab])

  /* -------------------------------------------------------------- */
  /* Export                                                         */
  /* -------------------------------------------------------------- */
  const currentTab = useCallback(
    (): Tab | null => tabsRef.current.find((tab) => tab.id === activeIdRef.current) ?? null,
    []
  )

  const exportPdf = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return
    const baseDir = tab.path ? dirnameOf(tab.path) : ''
    const doc = renderMarkdown(tab.content, { baseDir, direction: tab.direction })
    const html = buildPrintDocument({
      html: doc.html,
      title: stripExtension(tab.name),
      settings: settingsRef.current,
      rtl: tab.direction === 'rtl'
    })
    const result = await window.api.exportPdf({
      html,
      defaultName: stripExtension(tab.name),
      pageSize: settingsRef.current.pageSize,
      pageNumbers: settingsRef.current.pageNumbers,
      margin: settingsRef.current.margin,
      suggestedDir: baseDir,
      language: settingsRef.current.language
    })
    if (result.ok && result.path) notify(tRef.current('app.pdfExported', { path: result.path }), 'success')
    else if (result.error) notify(tRef.current('app.pdfFailed', { error: result.error }), 'error')
  }, [currentTab, notify])

  const exportDocx = useCallback(async () => {
    const tab = currentTab()
    if (!tab) return
    const baseDir = tab.path ? dirnameOf(tab.path) : ''
    const result = await window.api.exportDocx({
      markdown: tab.content,
      baseDir,
      defaultName: stripExtension(tab.name),
      rtl: tab.direction === 'rtl',
      suggestedDir: baseDir
    })
    if (result.ok && result.path) notify(tRef.current('app.docxExported', { path: result.path }), 'success')
    else if (result.error) notify(tRef.current('app.docxFailed', { error: result.error }), 'error')
  }, [currentTab, notify])

  /* -------------------------------------------------------------- */
  /* Window close + drag & drop                                     */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const off = window.api.onBeforeClose(() => {
      const dirty = tabsRef.current.filter((tab) => tab.content !== tab.savedContent)
      if (!dirty.length) {
        window.api.confirmClose(true)
        return
      }
      const translate = tRef.current
      setDialog({
        title: translate('app.closeTitle'),
        message: translate('app.closeMessage', { count: dirty.length }),
        buttons: [
          {
            label: translate('app.saveAllClose'),
            kind: 'primary',
            action: () => {
              void saveAll().then((ok) => window.api.confirmClose(ok))
            }
          },
          { label: translate('app.closeWithoutSaving'), kind: 'danger', action: () => window.api.confirmClose(true) },
          { label: translate('app.cancel'), kind: 'ghost', action: () => window.api.confirmClose(false) }
        ]
      })
    })
    return off
  }, [saveAll])

  useEffect(() => {
    const off = window.api.onOpenFile((file) => addFromOpened(file))
    return off
  }, [addFromOpened])

  useEffect(() => {
    const handleDrop = (event: DragEvent): void => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      const path = window.api.getPathForFile(file)
      if (path) void openPath(path)
    }
    const handleDragOver = (event: DragEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)
    return () => {
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
    }
  }, [openPath])

  /* -------------------------------------------------------------- */
  /* Find (editor + preview)                                        */
  /* -------------------------------------------------------------- */
  const openFind = useCallback(() => {
    const mode = layoutRef.current
    const active = document.activeElement as HTMLElement | null
    const inEditor = Boolean(active?.closest('.cm-editor'))
    if (mode === 'preview' || (mode === 'split' && !inEditor)) {
      setFindOpen(true)
      window.requestAnimationFrame(() => {
        const input = document.querySelector('.preview-find input') as HTMLInputElement | null
        input?.focus()
        input?.select()
      })
      return
    }
    const view = editorViewRef.current
    if (view) {
      view.focus()
      openSearchPanel(view)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      openFind()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openFind])

  /* -------------------------------------------------------------- */
  /* Menu                                                           */
  /* -------------------------------------------------------------- */
  const actionsRef = useRef<Record<string, () => void>>({})
  actionsRef.current = {
    new: newTab,
    open: () => void openDialog(),
    save: () => {
      const id = activeIdRef.current
      if (id) void saveTab(id)
    },
    'save-as': () => {
      const id = activeIdRef.current
      if (id) void saveTab(id, true)
    },
    'export-pdf': () => void exportPdf(),
    'export-docx': () => void exportDocx(),
    'close-tab': () => {
      const id = activeIdRef.current
      if (id) requestClose(id)
    },
    'toggle-preview': () => setLayout((prev) => (prev === 'preview' ? 'split' : 'preview')),
    'toggle-toc': () => setSidebar((prev) => !prev),
    find: openFind,
    'check-updates': () => {
      setSettingsOpen(true)
      void window.api.checkForUpdates().then(setUpdateStatus)
    },
    settings: () => setSettingsOpen(true),
    guide: () => setGuideOpen(true),
    about: () => undefined
  }

  useEffect(() => {
    const off = window.api.onMenu((action: MenuAction) => {
      actionsRef.current[action]?.()
    })
    return off
  }, [])

  /* -------------------------------------------------------------- */
  /* Splitter                                                       */
  /* -------------------------------------------------------------- */
  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const container = panesRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
      document.body.classList.add('resizing')

      const onMove = (moveEvent: MouseEvent): void => {
        const ratio = rtl
          ? ((rect.right - moveEvent.clientX) / rect.width) * 100
          : ((moveEvent.clientX - rect.left) / rect.width) * 100
        setEditorWidth(Math.min(80, Math.max(20, ratio)))
      }
      const onUp = (): void => {
        document.body.classList.remove('resizing')
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const next = { ...settingsRef.current, editorWidth: editorWidthRef.current }
        void window.api.setSettings(next)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    []
  )

  /* -------------------------------------------------------------- */
  /* Preview helpers                                                */
  /* -------------------------------------------------------------- */
  const scrollPreviewTo = useCallback((id: string) => {
    const container = previewRef.current
    if (!container) return
    const target = container.querySelector(`#${CSS.escape(id)}`)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handlePreviewAnchor = useCallback(
    (id: string) => {
      scrollPreviewTo(id)
    },
    [scrollPreviewTo]
  )

  const openLocal = useCallback(
    (path: string) => {
      if (MD_PATTERN.test(path)) void openPath(path)
      else void window.api.openWithSystem(path)
    },
    [openPath]
  )

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const index = order.indexOf(settingsRef.current.theme)
    updateSettings({ theme: order[(index + 1) % order.length] })
  }, [updateSettings])

  if (!loaded) {
    return (
      <div className="boot">
        <div className="boot-mark">INI</div>
      </div>
    )
  }

  return (
    <I18nProvider language={settings.language}>
      <div className="app">
        <Toolbar
          hasTab={Boolean(activeTab)}
          dirty={Boolean(activeTab && activeTab.content !== activeTab.savedContent)}
          layout={layout}
          sidebar={sidebar}
          theme={settings.theme}
          direction={activeTab?.direction ?? 'rtl'}
          onNew={newTab}
          onOpen={() => void openDialog()}
          onSave={() => {
            const id = activeIdRef.current
            if (id) void saveTab(id)
          }}
          onSaveAs={() => {
            const id = activeIdRef.current
            if (id) void saveTab(id, true)
          }}
          onExportPdf={() => void exportPdf()}
          onExportDocx={() => void exportDocx()}
          onToggleSidebar={() => setSidebar((prev) => !prev)}
          onLayout={setLayout}
          onCycleTheme={cycleTheme}
          onToggleDirection={toggleDirection}
          onSettings={() => setSettingsOpen(true)}
        />

        <TabBar tabs={tabs} activeId={activeId} onSelect={setActiveId} onClose={requestClose} onNew={newTab} />

        {updateStatus.state === 'downloaded' ? (
          <div className="update-banner">
            <Icon name="sparkle" size={15} />
            <span>{t('app.updateReady', { version: updateStatus.version ?? '' })}</span>
            <button className="primary-btn small" onClick={() => window.api.installUpdate()}>
              {t('app.updateRestart')}
            </button>
            <button className="ghost-btn small" onClick={() => setUpdateStatus((prev) => ({ ...prev, state: 'idle' }))}>
              {t('app.updateLater')}
            </button>
          </div>
        ) : null}

        <div className="main">
          {sidebar && activeTab ? (
            <Sidebar
              headings={rendered.headings}
              recent={recent}
              activeHeadingId={null}
              onHeading={scrollPreviewTo}
              onOpenRecent={(path) => void openPath(path)}
              onClearRecent={() => {
                void window.api.clearRecent().then(() => setRecent([]))
              }}
              onShowInFolder={(path) => void window.api.showItemInFolder(path)}
            />
          ) : null}

          <div className="panes-wrap">
            {activeTab ? (
              <div
                className={`panes layout-${layout}`}
                ref={panesRef}
                style={
                  layout === 'split'
                    ? { gridTemplateColumns: `minmax(0, ${editorWidth}%) 8px minmax(0, 1fr)` }
                    : undefined
                }
              >
                {layout !== 'preview' ? (
                  <section className="pane editor-pane">
                    <div className="pane-label">{t('pane.editor')}</div>
                    <EditorPane
                      tab={activeTab}
                      settings={settings}
                      onChange={(value) => updateContent(activeTab.id, value)}
                      onScrollRatio={(ratio) => {
                        const container = previewRef.current
                        if (!container) return
                        const max = container.scrollHeight - container.clientHeight
                        container.scrollTop = ratio * max
                      }}
                      onViewReady={(view) => {
                        editorViewRef.current = view
                      }}
                    />
                  </section>
                ) : null}

                {layout === 'split' ? (
                  <div className="splitter" onMouseDown={startResize} role="separator" aria-orientation="vertical" />
                ) : null}

                {layout !== 'editor' ? (
                  <section className="pane preview-pane">
                    <div className="pane-label">{t('pane.preview')}</div>
                    <PreviewPane
                      html={rendered.html}
                      direction={activeTab.direction}
                      settings={settings}
                      scrollRef={previewRef}
                      findOpen={findOpen}
                      onCloseFind={() => setFindOpen(false)}
                      onLocalFile={openLocal}
                      onAnchor={handlePreviewAnchor}
                    />
                  </section>
                ) : null}
              </div>
            ) : (
              <Welcome
                recent={recent}
                onNew={newTab}
                onOpen={() => void openDialog()}
                onOpenRecent={(path) => void openPath(path)}
              />
            )}
          </div>
        </div>

        <StatusBar
          tab={activeTab}
          words={words}
          lines={lines}
          autosave={settings.autosave}
          onShowInFolder={(path) => void window.api.showItemInFolder(path)}
        />

        {settingsOpen ? (
          <SettingsDialog
            settings={settings}
            version={version}
            updateStatus={updateStatus}
            onChange={updateSettings}
            onCheckUpdates={() => void window.api.checkForUpdates().then(setUpdateStatus)}
            onDownloadUpdate={() => void window.api.downloadUpdate().then(setUpdateStatus)}
            onInstallUpdate={() => window.api.installUpdate()}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {guideOpen ? <GuideDialog onClose={() => setGuideOpen(false)} /> : null}

        {dialog ? (
          <ConfirmDialog
            title={dialog.title}
            message={dialog.message}
            buttons={dialog.buttons}
            onClose={() => setDialog(null)}
          />
        ) : null}

        <div className="toasts">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.kind}`}>
              <span>{toast.text}</span>
              <button className="icon-btn" onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}>
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </I18nProvider>
  )
}
