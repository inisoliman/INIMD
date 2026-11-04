import { _electron as electron } from 'playwright'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sample = join(root, 'docs', 'sample-ar.md')
const outDir = join(root, 'docs', 'samples')
mkdirSync(outDir, { recursive: true })

const pdfOut = join(outDir, 'midad-sample.pdf')
const docxOut = join(outDir, 'midad-sample.docx')
for (const file of [pdfOut, docxOut]) rmSync(file, { force: true })

const app = await electron.launch({
  args: ['.', sample],
  env: {
    ...process.env,
    MIDAD_PDF_OUT: pdfOut,
    MIDAD_DOCX_OUT: docxOut
  }
})

const win = await app.firstWindow()
const errors = []
win.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
win.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)

const clickMenu = async (path) => {
  await app.evaluate(({ Menu }, labels) => {
    let items = Menu.getApplicationMenu()?.items ?? []
    let item
    for (const label of labels) {
      item = items.find((entry) => entry.label === label)
      if (!item) throw new Error(`Menu item not found: ${label}`)
      items = item.submenu ? item.submenu.items : []
    }
    item.click()
  }, path)
  await new Promise((resolve) => setTimeout(resolve, 150))
}

const waitFor = async (file) => {
  for (let i = 0; i < 60; i += 1) {
    if (existsSync(file) && statSync(file).size > 4000) return true
    await win.waitForTimeout(400)
  }
  return false
}

await clickMenu(['ملف', 'تصدير إلى PDF…'])
const pdfOk = await waitFor(pdfOut)
await win.waitForTimeout(600)

await clickMenu(['ملف', 'تصدير إلى Word…'])
const docxOk = await waitFor(docxOut)

const report = {
  pdf: { ok: pdfOk, size: existsSync(pdfOut) ? statSync(pdfOut).size : 0 },
  docx: { ok: docxOk, size: existsSync(docxOut) ? statSync(docxOut).size : 0 },
  errors
}
console.log(JSON.stringify(report, null, 2))

await win.evaluate(() => window.api.confirmClose(true)).catch(() => undefined)
await app.close()
