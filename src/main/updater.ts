import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import { getSettings } from './store'

const OWNER = 'inisoliman'
const REPO = 'INIMD'

let status: UpdateStatus = { state: 'idle' }
let initialized = false
let emit: (value: UpdateStatus) => void = () => undefined
let authToken = ''

function setStatus(patch: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...patch }
  emit(status)
  return status
}

function resolveToken(configured: string): string {
  return process.env['INIMD_GH_TOKEN'] || process.env['GH_TOKEN'] || configured || ''
}

function applyFeed(token: string): void {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: OWNER,
    repo: REPO,
    releaseType: 'release'
  })
  if (token) {
    autoUpdater.addAuthHeader(`token ${token}`)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(sender: (value: UpdateStatus) => void): void {
  emit = sender
  if (initialized) {
    emit(status)
    return
  }
  initialized = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', message: undefined })
  })
  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'available', version: info.version, percent: 0 })
  })
  autoUpdater.on('update-not-available', () => {
    setStatus({ state: 'not-available', version: app.getVersion(), percent: undefined })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({ state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent))) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version, percent: 100 })
  })
  autoUpdater.on('error', (error) => {
    setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}

async function configure(): Promise<string> {
  const settings = await getSettings()
  const token = resolveToken(settings.updateToken)
  if (token !== authToken) {
    authToken = token
    applyFeed(token)
  }
  autoUpdater.autoDownload = settings.autoUpdate
  return token
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return setStatus({ state: 'disabled', message: 'dev' })
  }
  try {
    await configure()
    setStatus({ state: 'checking', message: undefined, checkedAt: Date.now() })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return setStatus({ state: 'disabled', message: 'dev' })
  try {
    await configure()
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  return status
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

export function getUpdateConfig(): { owner: string; repo: string } {
  return { owner: OWNER, repo: REPO }
}
