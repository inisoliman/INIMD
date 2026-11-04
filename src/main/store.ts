import { app } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { DEFAULT_SETTINGS, type RecentFile, type Settings } from '../shared/types'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')
const recentPath = (): string => join(app.getPath('userData'), 'recent.json')

let settingsCache: Settings | null = null

function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  merged.fontSize = Math.min(28, Math.max(11, Number(merged.fontSize) || 16))
  merged.lineHeight = Math.min(2.6, Math.max(1.3, Number(merged.lineHeight) || 1.9))
  merged.margin = Math.min(40, Math.max(5, Number(merged.margin) || 20))
  merged.editorWidth = Math.min(80, Math.max(20, Number(merged.editorWidth) || 50))
  return merged
}

export async function getSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    settingsCache = normalizeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch {
    settingsCache = { ...DEFAULT_SETTINGS }
  }
  return settingsCache
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = normalizeSettings({ ...current, ...patch })
  settingsCache = next
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

async function readRecent(): Promise<RecentFile[]> {
  try {
    const raw = await fs.readFile(recentPath(), 'utf8')
    const list = JSON.parse(raw) as RecentFile[]
    if (!Array.isArray(list)) return []
    return list.filter((item) => item && typeof item.path === 'string')
  } catch {
    return []
  }
}

async function writeRecent(list: RecentFile[]): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(recentPath(), JSON.stringify(list.slice(0, 20), null, 2), 'utf8')
}

export async function getRecent(): Promise<RecentFile[]> {
  const list = await readRecent()
  const alive: RecentFile[] = []
  for (const item of list) {
    try {
      const stat = await fs.stat(item.path)
      if (stat.isFile()) alive.push(item)
    } catch {
      /* missing file: drop it */
    }
  }
  if (alive.length !== list.length) await writeRecent(alive)
  return alive
}

export async function addRecent(filePath: string): Promise<RecentFile[]> {
  const list = await readRecent()
  const entry: RecentFile = {
    path: filePath,
    name: basename(filePath),
    openedAt: Date.now()
  }
  const next = [entry, ...list.filter((item) => item.path.toLowerCase() !== filePath.toLowerCase())]
  await writeRecent(next)
  return getRecent()
}

export async function clearRecent(): Promise<void> {
  await writeRecent([])
}
