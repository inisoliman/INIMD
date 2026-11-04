import { _electron as electron } from 'playwright'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe = join(root, 'release', 'win-unpacked', 'Midad.exe')
const sample = join(root, 'docs', 'sample-ar.md')
const pdfOut = join(tmpdir(), 'midad-packaged.pdf')

if (!existsSync(exe)) {
  console.error('missing packaged exe:', exe)
  process.exit(1)
}

const app = await electron.launch({
  executablePath: exe,
  args: [sample],
  env: { ...process.env, MIDAD_PDF_OUT: pdfOut }
})
const win = await app.firstWindow()
const errors = []
win.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
win.on('pageerror', (error) => errors.push(error.message))

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2200)

const report = {
  title: await win.title(),
  tabs: await win.locator('.tab').count(),
  headings: await win.locator('.toc-item').count(),
  tableRows: await win.locator('.md-body table tr').count(),
  imageLoaded: await win.locator('.md-body img').first().evaluate((img) => img.complete && img.naturalWidth > 0),
  dir: await win.locator('.preview-scroll').getAttribute('dir'),
  errors
}

await app.evaluate(({ Menu }) => {
  const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'ملف')
  const exportItem = file?.submenu?.items.find((item) => item.label === 'تصدير إلى PDF…')
  exportItem?.click()
})

for (let i = 0; i < 50; i += 1) {
  if (existsSync(pdfOut) && statSync(pdfOut).size > 4000) break
  await win.waitForTimeout(400)
}
report.pdf = { exists: existsSync(pdfOut), size: existsSync(pdfOut) ? statSync(pdfOut).size : 0 }

await win.screenshot({ path: join(tmpdir(), 'midad-packaged.png') })
console.log(JSON.stringify(report, null, 2))

await win.evaluate(() => window.api.confirmClose(true)).catch(() => undefined)
await app.close()
