import { _electron as electron } from 'playwright'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docs = join(root, 'docs')
const sample = join(docs, 'sample-ar.md')
const working = join(docs, '.test-sample.md')
const outputDir = join(docs, 'test-output')

mkdirSync(outputDir, { recursive: true })
const logFile = join(outputDir, 'log.txt')
rmSync(logFile, { force: true })
const log = (message) => {
  appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`)
  process.stderr.write(`${message}\n`)
}

log('start')
copyFileSync(sample, working)

const pdfOut = join(outputDir, 'sample.pdf')
const docxOut = join(outputDir, 'sample.docx')
const htmlOut = join(outputDir, 'print.html')
for (const file of [pdfOut, docxOut, htmlOut]) rmSync(file, { force: true })

log('launching')
const app = await electron.launch({
  args: ['.', working],
  env: {
    ...process.env,
    MIDAD_PDF_OUT: pdfOut,
    MIDAD_DOCX_OUT: docxOut,
    MIDAD_HTML_OUT: htmlOut
  }
})

const win = await app.firstWindow()
log('window ready')

const clickMenu = async (labels) => {
  await app.evaluate(({ Menu }, path) => {
    let items = Menu.getApplicationMenu()?.items ?? []
    let item
    for (const label of path) {
      item = items.find((entry) => entry.label === label)
      if (!item) throw new Error(`Menu item not found: ${label}`)
      items = item.submenu ? item.submenu.items : []
    }
    item.click()
  }, labels)
  await new Promise((resolve) => setTimeout(resolve, 150))
}

const errors = []
win.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
win.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(1800)

const report = {}
report.title = await win.title()
report.hasArabic = /[\u0600-\u06FF]/.test(await win.locator('.md-body').innerText())
report.headings = await win.locator('.toc-item').count()
report.tableRows = await win.locator('.md-body table tr').count()
report.imageSrc = await win.locator('.md-body img').first().getAttribute('src')
report.dir = await win.locator('.preview-scroll').getAttribute('dir')
report.tabs = await win.locator('.tab').count()
report.editorVisible = await win.locator('.cm-editor').isVisible()

await win.screenshot({ path: join(docs, 'screenshot-main.png') })
log('screenshots done')

// theme cycle: light -> dark
await win.locator('.tb[title^="المظهر"]').click()
await win.waitForTimeout(350)
report.darkTheme = await win.evaluate(() => document.documentElement.dataset.theme)
await win.screenshot({ path: join(docs, 'screenshot-dark.png') })

// preview only
await win.getByTitle('المعاينة فقط').click()
await win.waitForTimeout(450)
await win.screenshot({ path: join(docs, 'screenshot-preview.png') })
report.previewOnlyEditorHidden = (await win.locator('.cm-editor').count()) === 0

// back to split + light theme
await win.getByTitle('عرض مقسوم').click()
await win.waitForTimeout(300)
await win.locator('.tb[title^="المظهر"]').click() // dark -> system
await win.locator('.tb[title^="المظهر"]').click() // system -> light
await win.waitForTimeout(300)
log('theme done')

// editing
const editor = win.locator('.cm-content')
await editor.click()
await win.keyboard.press('Control+End')
await win.keyboard.type('\n\nسطر اختباري أضافه الاختبار الآلي.')
await win.waitForTimeout(300)
report.dirtyAfterTyping = (await win.locator('.tab-dot.on').count()) > 0
report.wordCountText = (await win.locator('.statusbar').innerText()).replace(/\s+/g, ' ').trim()
log('typing done')

// save via accelerator
log('save via menu')
await clickMenu(['ملف', 'حفظ'])
await win.waitForTimeout(1500)
const savedContent = readFileSync(working, 'utf8')
report.savedToDisk = savedContent.includes('سطر اختباري أضافه الاختبار الآلي')
report.dirtyAfterSave = (await win.locator('.tab-dot.on').count()) > 0
log('save done')

// export PDF through the real renderer pipeline
await clickMenu(['ملف', 'تصدير إلى PDF…'])
let pdfOk = false
for (let i = 0; i < 40; i += 1) {
  if (existsSync(pdfOut) && statSync(pdfOut).size > 5000) {
    pdfOk = true
    break
  }
  await win.waitForTimeout(500)
}
report.pdf = { ok: pdfOk, size: existsSync(pdfOut) ? statSync(pdfOut).size : 0 }
report.printHtml = { exists: existsSync(htmlOut), size: existsSync(htmlOut) ? statSync(htmlOut).size : 0 }
log('pdf done')

// export Word
await clickMenu(['ملف', 'تصدير إلى Word…'])
let docxOk = false
for (let i = 0; i < 40; i += 1) {
  if (existsSync(docxOut) && statSync(docxOut).size > 5000) {
    docxOk = true
    break
  }
  await win.waitForTimeout(500)
}
report.docx = { ok: docxOk, size: existsSync(docxOut) ? statSync(docxOut).size : 0 }
log('docx done')

report.errors = errors
console.log(JSON.stringify(report, null, 2))

await win.evaluate(() => window.api.confirmClose(true)).catch(() => undefined)
await app.close()
rmSync(working, { force: true })
log('closed')
