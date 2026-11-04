import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe = join(root, 'release', 'win-unpacked', 'INIMD.exe')

if (!existsSync(exe)) {
  console.error('missing packaged exe:', exe)
  process.exit(1)
}

function gitHubToken() {
  for (const name of ['INIMD_GH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8'
    })
    const match = out.match(/^password=(.+)$/m)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

const token = gitHubToken()
const userData = join(tmpdir(), 'inimd-update-check')
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ autoUpdate: false, updateToken: token, language: 'ar' }, null, 2),
  'utf8'
)

const app = await electron.launch({
  executablePath: exe,
  args: ['--user-data-dir', userData],
  env: { ...process.env, INIMD_GH_TOKEN: token, GH_TOKEN: token }
})
const win = await app.firstWindow()
const errors = []
win.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
win.on('pageerror', (error) => errors.push(error.message))

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)

const report = {
  version: await win.evaluate(() => window.api.getVersion()),
  token: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '(none)',
  packaged: await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)
}

await win.evaluate(() => {
  globalThis.__inimdStatuses = []
  window.api.onUpdateStatus((status) => globalThis.__inimdStatuses.push(status))
})

report.status = await win.evaluate(() => window.api.checkForUpdates())

// Collect pushed statuses until the updater settles (or we give up).
const terminal = ['available', 'not-available', 'downloaded', 'error']
if (!terminal.includes(report.status.state)) {
  for (let i = 0; i < 60; i += 1) {
    await win.waitForTimeout(500)
    const list = await win.evaluate(() => globalThis.__inimdStatuses)
    const last = list[list.length - 1]
    if (last && terminal.includes(last.state) && last.state !== 'available') {
      report.status = last
      break
    }
  }
}
report.statuses = await win.evaluate(() => globalThis.__inimdStatuses)

report.errors = errors
console.log(JSON.stringify(report, null, 2))

const accepted = ['available', 'not-available', 'downloaded']
await win.evaluate(() => window.api.confirmClose(true)).catch(() => undefined)
await app.close()
process.exit(accepted.includes(report.status.state) && !errors.length ? 0 : 1)
