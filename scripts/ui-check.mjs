import { _electron as electron } from 'playwright'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
// نحوّل العيّنة إلى CRLF كما تأتي معظم ملفات ويندوز، لاختبار انحدار «غير محفوظ» عند الفتح.
writeFileSync(working, readFileSync(working, 'utf8').replace(/\r?\n/g, '\r\n'))

// اجعل بداية الاختبار محددة: عربي + فاتح + بلا حفظ تلقائي
const settingsFile = join(process.env.APPDATA ?? '', 'INIMD', 'settings.json')
mkdirSync(dirname(settingsFile), { recursive: true })
let savedSettings = {}
try {
  savedSettings = JSON.parse(readFileSync(settingsFile, 'utf8'))
} catch {
  savedSettings = {}
}
writeFileSync(
  settingsFile,
  JSON.stringify(
    { ...savedSettings, language: 'ar', theme: 'light', autosave: false, defaultDirection: 'auto' },
    null,
    2
  )
)

const pdfOut = join(outputDir, 'sample.pdf')
const docxOut = join(outputDir, 'sample.docx')
const htmlOut = join(outputDir, 'print.html')
for (const file of [pdfOut, docxOut, htmlOut]) rmSync(file, { force: true })

log('launching')
const app = await electron.launch({
  args: ['.', working],
  env: {
    ...process.env,
    INIMD_PDF_OUT: pdfOut,
    INIMD_DOCX_OUT: docxOut,
    INIMD_HTML_OUT: htmlOut
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

const openSettings = async () => {
  await app.evaluate(({ Menu }) => {
    const entries = Menu.getApplicationMenu()?.items ?? []
    for (const top of entries) {
      for (const sub of top.submenu?.items ?? []) {
        if (sub.accelerator === 'CmdOrCtrl+,') {
          sub.click()
          return
        }
      }
    }
    throw new Error('settings menu item not found')
  })
  await win.waitForTimeout(300)
}

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
await win.locator('.toolbar .icon-only').nth(2).click()
await win.waitForTimeout(350)
report.darkTheme = await win.evaluate(() => document.documentElement.dataset.theme)
await win.screenshot({ path: join(docs, 'screenshot-dark.png') })

// preview only
await win.locator('.toolbar .segmented button').nth(2).click()
await win.waitForTimeout(450)
await win.screenshot({ path: join(docs, 'screenshot-preview.png') })
report.previewOnlyEditorHidden = (await win.locator('.cm-editor').count()) === 0

// back to split + light theme
await win.locator('.toolbar .segmented button').nth(1).click()
await win.waitForTimeout(300)
await win.locator('.toolbar .icon-only').nth(2).click() // dark -> system
await win.locator('.toolbar .icon-only').nth(2).click() // system -> light
await win.waitForTimeout(300)
log('theme done')

// انحدار «غير محفوظ»: العيّنة نهايات أسطرها CRLF. كتابة ثم تراجع تُرجع النص لما على القرص،
// فيجب ألّا تبقى علامة التعديل. قبل الإصلاح تبقى لأن المحرر يعمل داخلياً بـ LF والملف CRLF.
log('crlf regression')
report.crlfDirtyOnOpen = (await win.locator('.tab-dot.on').count()) > 0
await win.locator('.cm-content').click({ force: true })
await win.keyboard.press('Control+End')
await win.keyboard.type('x')
await win.waitForTimeout(250)
report.crlfDirtyAfterType = (await win.locator('.tab-dot.on').count()) > 0
await win.keyboard.press('Control+Z')
await win.waitForTimeout(450)
report.crlfDirtyAfterUndo = (await win.locator('.tab-dot.on').count()) > 0
log('crlf regression done')

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

// external change from another program -> automatic reload
// نُعدّل موضعين متباعدين حتى يكون هناك أكثر من بلوك متغيّر لاختبار التنقل.
log('external change')
const beforeExternal = readFileSync(working, 'utf8')
const externalLines = beforeExternal.split(/\r?\n/)
const firstPart = externalLines.slice(0, 2).join('\n')
const restPart = externalLines.slice(2).join('\n')
writeFileSync(
  working,
  `${firstPart}\n\nفقرة أضافها محرر آخر في أول الملف — external edit marker.\n\n${restPart}\n\nسطر أضافه محرر آخر في آخر الملف — second edit marker.\n`
)
let externalReload = false
for (let i = 0; i < 24; i += 1) {
  await win.waitForTimeout(250)
  if ((await win.locator('.md-body').innerText()).includes('external edit marker')) {
    externalReload = true
    break
  }
}
report.externalReload = externalReload
report.externalDirty = (await win.locator('.tab-dot.on').count()) > 0
report.externalDialog = await win.locator('.modal').count()
report.changeHighlight = await win.locator('.md-body .md-changed').count()
report.changeBanner = await win.locator('.change-banner').isVisible()
report.editorChangedLines = await win.locator('.cm-changed-line').count()

// زر «قراءة التغييرات» + سهمَي التنقل
const reviewBtn = win.locator('.change-review-btn')
report.reviewButton = await reviewBtn.isVisible()
report.reviewCount = (await reviewBtn.innerText()).trim()
await reviewBtn.click()
await win.waitForTimeout(500)
report.reviewBarVisible = await win.locator('.change-banner.reviewing').isVisible()
report.reviewPosition = (await win.locator('.change-review-text').innerText()).trim()
report.reviewPrevDisabled = await win.locator('.change-nav').first().isDisabled()
report.reviewTargetVisible = await win.locator('.md-body .md-change-target').count()
report.reviewNextEnabled = !(await win.locator('.change-nav').nth(1).isDisabled())
await win.locator('.change-nav').nth(1).click()
await win.waitForTimeout(700)
report.reviewPositionAfterNext = (await win.locator('.change-review-text').innerText()).trim()
report.reviewPrevEnabled = !(await win.locator('.change-nav').first().isDisabled())
report.reviewNextDisabledAtEnd = await win.locator('.change-nav').nth(1).isDisabled()
report.reviewScrolledDown = (await win.locator('.preview-scroll').evaluate((node) => node.scrollTop)) > 0
await win.screenshot({ path: join(docs, 'screenshot-review.png') })
await win.locator('.change-nav').first().click()
await win.waitForTimeout(700)
report.reviewPositionAfterPrev = (await win.locator('.change-review-text').innerText()).trim()
// F7 يتقدّم وShift+F7 يرجع
await win.keyboard.press('F7')
await win.waitForTimeout(600)
report.reviewPositionAfterF7 = (await win.locator('.change-review-text').innerText()).trim()
await win.keyboard.press('Shift+F7')
await win.waitForTimeout(600)
report.reviewPositionAfterShiftF7 = (await win.locator('.change-review-text').innerText()).trim()
await win.keyboard.press('Escape')
await win.waitForTimeout(400)
report.reviewClosedByEscape = (await win.locator('.change-banner.reviewing').count()) === 0
report.reviewTargetsCleared = (await win.locator('.md-body .md-change-target').count()) === 0
// إعادة الدخول ثم الإنهاء بالزر
await win.locator('.change-review-btn').click()
await win.waitForTimeout(500)
await win.locator('.change-banner.reviewing .ghost-btn').last().click()
await win.waitForTimeout(400)
report.reviewClosed = (await win.locator('.change-banner.reviewing').count()) === 0

// وضع المعاينة فقط: التنقل يبرز البلوك دون محرر ظاهر
await win.locator('.toolbar .segmented button').nth(2).click()
await win.waitForTimeout(400)
await win.locator('.change-review-btn').click()
await win.waitForTimeout(500)
await win.locator('.change-nav').nth(1).click()
await win.waitForTimeout(700)
report.reviewPreviewOnlyTarget = await win.locator('.md-body .md-change-target').count()
report.reviewPreviewOnlyPosition = (await win.locator('.change-review-text').innerText()).trim()
await win.locator('.toolbar .segmented button').nth(1).click()
await win.waitForTimeout(400)
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

// الكتابة في المحرر تُلغي التظليل والمراجعة معاً
await win.locator('.change-review-btn').click()
await win.waitForTimeout(300)
await win.locator('.cm-content').click()
await win.keyboard.press('Control+End')
await win.keyboard.type(' ')
await win.waitForTimeout(600)
report.reviewClosedAfterTyping = (await win.locator('.change-banner').count()) === 0
await win.keyboard.press('Control+z')
await win.waitForTimeout(400)
log('external change done')

// مراقبة الحفظ الذري (كتابة ملف مؤقت + إعادة تسمية) — أسلوب VS Code وJetBrains.
// قبل الإصلاح كانت مراقبة الملف نفسه تموت بعد أول إعادة تسمية.
log('atomic save watcher')
report.reloadButtonVisible = await win.locator('.status-reload').isVisible()
let atomicRound = 0
for (let round = 1; round <= 2; round += 1) {
  const staged = `${working}.tmp`
  writeFileSync(staged, `${readFileSync(working, 'utf8').replace(/\r?\n/g, '\r\n')}\r\nسطر ذري ${round} — atomic marker.\r\n`)
  renameSync(staged, working)
  let seen = false
  for (let i = 0; i < 40; i += 1) {
    await win.waitForTimeout(250)
    if ((await win.locator('.md-body').innerText()).includes(`atomic marker`)) {
      seen = true
      break
    }
  }
  if (seen) atomicRound += 1
  if (await win.locator('.change-banner .ghost-btn').count()) {
    await win.locator('.change-banner .ghost-btn').last().click().catch(() => undefined)
    await win.waitForTimeout(300)
  }
}
report.atomicSavesDetected = `${atomicRound}/2`

// التحديث اليدوي من القرص (زر شريط الحالة + F5) — شبكة أمان حين لا يصل حدث المراقبة.
const manualStaged = `${working}.tmp`
writeFileSync(manualStaged, `${readFileSync(working, 'utf8')}\r\nسطر يدوي — manual reload marker.\r\n`)
renameSync(manualStaged, working)
await win.waitForTimeout(400)
await win.locator('.status-reload').click({ force: true })
let manualSeen = false
for (let i = 0; i < 32; i += 1) {
  await win.waitForTimeout(250)
  if ((await win.locator('.md-body').innerText()).includes('manual reload marker')) {
    manualSeen = true
    break
  }
}
report.manualReloadDetected = manualSeen
log('atomic save watcher done')

// فهرس المحتويات: البند النشط يتبع التمرير
await win.locator('.preview-scroll').evaluate((node) => {
  node.scrollTop = node.scrollHeight
})
await win.waitForTimeout(500)
report.tocActiveAtBottom = await win.locator('.toc-item.active').count()
report.tocActiveTextAtBottom = (await win.locator('.toc-item.active').innerText().catch(() => '')).trim()
await win.locator('.preview-scroll').evaluate((node) => {
  node.scrollTop = 0
})
await win.waitForTimeout(500)
report.tocActiveAtTop = (await win.locator('.toc-item.active').innerText().catch(() => '')).trim()

// النقر الأيمن على نص محدد في المعاينة -> قائمة نسخ
await win.evaluate(() => {
  const paragraph = document.querySelector('.md-body p')
  if (!paragraph) return
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  const rect = paragraph.getBoundingClientRect()
  paragraph.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + 12),
      clientY: Math.round(rect.top + 12)
    })
  )
})
await win.waitForTimeout(300)
report.contextMenuVisible = await win.locator('.preview-menu').isVisible()
report.contextMenuItems = await win.locator('.preview-menu-item').count()
await win.locator('.preview-menu-item').first().click()
await win.waitForTimeout(400)
report.contextMenuClosed = (await win.locator('.preview-menu').count()) === 0
report.copiedText = await app.evaluate(({ clipboard }) => clipboard.readText())
log('context menu done')

// find inside the preview (Ctrl+F)
await win.locator('.toolbar .segmented button').nth(2).click()
await win.waitForTimeout(400)
await win.locator('.md-body').click()
await win.keyboard.press('Control+f')
await win.waitForTimeout(350)
report.findBarVisible = await win.locator('.preview-find').isVisible()
await win.locator('.preview-find-input input').fill('INIMD')
await win.waitForTimeout(400)
report.findCount = (await win.locator('.preview-find-count').innerText()).trim()
report.findHighlights = await win.evaluate(() => ({
  all: globalThis.CSS?.highlights?.get('inimd-find')?.size ?? 0,
  active: globalThis.CSS?.highlights?.get('inimd-find-active')?.size ?? 0
}))
await win.screenshot({ path: join(docs, 'screenshot-find.png') })
await win.locator('.preview-find .icon-btn').nth(1).click()
await win.waitForTimeout(250)
report.findNextCount = (await win.locator('.preview-find-count').innerText()).trim()
await win.keyboard.press('Escape')
await win.waitForTimeout(300)
report.findClosed = (await win.locator('.preview-find').count()) === 0
await win.locator('.toolbar .segmented button').nth(1).click()
await win.waitForTimeout(300)
log('find done')

// language switch: Arabic -> English -> Arabic
await openSettings()
await win.getByRole('button', { name: 'English', exact: true }).click()
await win.waitForTimeout(600)
report.language = await win.evaluate(() => ({
  lang: document.documentElement.lang,
  dir: document.documentElement.dir
}))
report.menuLabels = await app.evaluate(({ Menu }) =>
  (Menu.getApplicationMenu()?.items ?? []).map((item) => item.label)
)
report.toolbarNewLabel = (await win.locator('.toolbar').innerText()).replace(/\s+/g, ' ').trim().slice(0, 60)
await win.screenshot({ path: join(docs, 'screenshot-english-settings.png') })
await win.locator('.modal-body').evaluate((node) => {
  node.scrollTop = node.scrollHeight
})
await win.waitForTimeout(400)
await win.screenshot({ path: join(docs, 'screenshot-updates.png') })
await win.locator('.settings-footer .primary-btn').click()
await win.waitForTimeout(400)
await win.screenshot({ path: join(docs, 'screenshot-english.png') })
await openSettings()
await win.getByRole('button', { name: 'العربية', exact: true }).click()
await win.waitForFunction(() => document.documentElement.lang === 'ar')
await win.waitForTimeout(400)
report.languageBack = await win.evaluate(() => ({
  lang: document.documentElement.lang,
  dir: document.documentElement.dir
}))
await win.locator('.settings-footer .primary-btn').click()
await win.waitForTimeout(250)
report.persistedLanguage = await win.evaluate(async () => (await window.api.getSettings()).language)
log('language done')

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
