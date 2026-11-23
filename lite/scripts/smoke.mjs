// اختبار دخاني لنسخة INIMD Lite (Tauri + WebView2) عبر CDP.
// التشغيل: node lite/scripts/smoke.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const exe = process.env.INIMD_LITE_EXE
  ? resolve(process.env.INIMD_LITE_EXE)
  : [
      join(root, 'lite', 'src-tauri', 'target', 'release', 'inimd-lite.exe'),
      join(root, 'lite', 'src-tauri', 'target', 'release', 'INIMD Lite.exe')
    ].find((candidate) => existsSync(candidate)) ??
    join(root, 'lite', 'src-tauri', 'target', 'release', 'inimd-lite.exe')

if (!existsSync(exe)) {
  console.error(`لم يُعثر على الملف التنفيذي: ${exe}\nابنِ النسخة أولاً: cd lite && npm run dist`)
  process.exit(1)
}

const docs = join(root, 'docs')
const outDir = join(docs, 'test-output', 'lite')
mkdirSync(outDir, { recursive: true })
// يبقى في docs/ لأن ملفات العيّنة تشير إلى الصور بمسارات نسبية
const working = join(docs, 'lite-sample-ar.md')
copyFileSync(join(docs, 'sample-ar.md'), working)
// نحوّل العيّنة إلى CRLF كما تأتي معظم ملفات ويندوز، لاختبار انحدار «غير محفوظ» عند الفتح.
writeFileSync(working, readFileSync(working, 'utf8').replace(/\r?\n/g, '\r\n'))

// ابدأ من إعدادات عربية محددة (مجلد إعدادات Tauri: %APPDATA%\com.ini.inimd.lite)
const settingsDir = join(process.env.APPDATA ?? '', 'com.ini.inimd.lite')
mkdirSync(settingsDir, { recursive: true })
const settingsFile = join(settingsDir, 'settings.json')
// ابدأ بقائمة ملفات حديثة نظيفة حتى تظهر اللقطة بدون مخلفات تشغيل سابقة
const recentFile = join(settingsDir, 'recent.json')
rmSync(recentFile, { force: true })
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

const pdfPath = join(outDir, 'smoke.pdf')
const docxPath = join(outDir, 'smoke.docx')
for (const file of [pdfPath, docxPath]) rmSync(file, { force: true })

const port = 9333
const child = spawn(exe, [working], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    INIMD_PDF_OUT: pdfPath,
    INIMD_SAVE_OUT: docxPath
  },
  stdio: 'ignore'
})

const sleep = (ms) => new Promise((resolveTimeout) => setTimeout(resolveTimeout, ms))

let browser
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 })
    break
  } catch {
    await sleep(500)
  }
}
if (!browser) {
  child.kill()
  console.error('تعذّر الاتصال بـ WebView2 عبر CDP')
  process.exit(1)
}

const report = { exe, errors: [] }
try {
  const context = browser.contexts()[0]
  let page = context.pages()[0]
  for (let attempt = 0; attempt < 40 && !page; attempt += 1) {
    await sleep(250)
    page = context.pages()[0]
  }
  if (!page) throw new Error('no page')
  page.on('pageerror', (error) => report.errors.push(String(error)))

  await page.waitForSelector('.md-body h1', { timeout: 30000 })
  report.title = await page.title()
  report.tabs = await page.locator('.tab').count()
  report.headings = await page.locator('.md-body h1, .md-body h2').count()
  report.tableRows = await page.locator('.md-body table tr').count()
  report.dir = await page.locator('.preview-scroll').getAttribute('dir')
  try {
    await page.locator('.md-body img').first().scrollIntoViewIfNeeded({ timeout: 5000 })
  } catch {
    /* no image in this document */
  }
  report.imageLoaded = await page.evaluate(async () => {
    const image = document.querySelector('.md-body img')
    if (!image) return false
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (image.complete && image.naturalWidth > 0) return true
      await new Promise((done) => setTimeout(done, 200))
    }
    return image.complete && image.naturalWidth > 0
  })
  report.imageSrc = await page.evaluate(() => document.querySelector('.md-body img')?.getAttribute('src') ?? '')
  report.language = await page.evaluate(() => document.documentElement.lang)
  // انحدار «غير محفوظ»: العيّنة CRLF، فلا يجب أن يظهر التبويب معدَّلاً بمجرد الفتح.
  report.crlfDirtyOnOpen = (await page.locator('.tab-dot.on').count()) > 0
  report.crlfPreserved = readFileSync(working, 'utf8').includes('\r\n')

  await page.screenshot({ path: join(docs, 'screenshot-lite.png') })

  // تبديل اللغة من عربي إلى إنجليزي ثم العربية
  report.languageSwitch = await page.evaluate(async () => {
    const current = await window.api.getSettings()
    await window.api.setSettings({ ...current, language: 'en' })
    return (await window.api.getSettings()).language
  })

  // إعادة تحميل الملف بعد تعديله خارجياً (موضعان متباعدان = أكثر من بلوك متغيّر)
  const before = await page.locator('.md-body h1').first().innerText()
  const originalLines = readFileSync(working, 'utf8').split(/\r?\n/)
  writeFileSync(
    working,
    `${originalLines.slice(0, 2).join('\n')}\n\n## تعديل خارجي في الأعلى\n\n${originalLines.slice(2).join('\n')}\n\n## تعديل خارجي للاختبار\n`
  )
  let externalReload = false
  for (let attempt = 0; attempt < 40 && !externalReload; attempt += 1) {
    await sleep(300)
    externalReload = await page.evaluate(() => document.body.innerText.includes('تعديل خارجي للاختبار'))
  }
  report.externalReload = externalReload
  report.firstHeading = before
  report.changeHighlight = await page.locator('.md-body .md-changed').count()
  report.changeBanner = await page.locator('.change-banner').isVisible()

  // زر «قراءة التغييرات» والتنقل بين المواضع + F7
  const reviewBtn = page.locator('.change-review-btn')
  report.reviewButton = await reviewBtn.isVisible()
  await reviewBtn.click()
  await sleep(400)
  report.reviewBarVisible = await page.locator('.change-banner.reviewing').isVisible()
  report.reviewPosition = await page.locator('.change-review-text').innerText()
  report.reviewPrevDisabled = await page.locator('.change-nav').first().isDisabled()
  report.reviewTargetVisible = await page.locator('.md-body .md-change-target').count()
  report.reviewNextEnabled = !(await page.locator('.change-nav').nth(1).isDisabled())
  await page.locator('.change-nav').nth(1).click()
  await sleep(600)
  report.reviewPositionAfterNext = await page.locator('.change-review-text').innerText()
  report.reviewScrolledDown =
    (await page.locator('.preview-scroll').evaluate((node) => node.scrollTop)) > 0
  await page.keyboard.press('Shift+F7')
  await sleep(600)
  report.reviewPositionAfterShiftF7 = await page.locator('.change-review-text').innerText()
  await page.keyboard.press('Escape')
  await sleep(400)
  report.reviewClosedByEscape = (await page.locator('.change-banner.reviewing').count()) === 0
  report.reviewTargetsCleared = (await page.locator('.md-body .md-change-target').count()) === 0

  // فهرس المحتويات: البند النشط يتبع التمرير
  await page.locator('.preview-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await sleep(500)
  report.tocActiveAtBottom = await page
    .locator('.toc-item.active')
    .innerText()
    .catch(() => '')
  await page.locator('.preview-scroll').evaluate((node) => {
    node.scrollTop = 0
  })
  await sleep(500)
  report.tocActiveAtTop = await page
    .locator('.toc-item.active')
    .innerText()
    .catch(() => '')

  // النقر الأيمن على نص محدد في المعاينة -> قائمة نسخ
  await page.evaluate(() => {
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
  await sleep(250)
  report.contextMenuVisible = await page.locator('.preview-menu').isVisible()
  await page.locator('.preview-menu-item').first().click()
  await sleep(300)
  report.contextMenuClosed = (await page.locator('.preview-menu').count()) === 0
  report.copiedText = await page
    .evaluate(async () => {
      try {
        return await navigator.clipboard.readText()
      } catch {
        return ''
      }
    })
    .catch(() => '')

  // تصدير PDF عبر Edge headless (مسار Rust الحقيقي)
  report.pdf = await page.evaluate(
    async ({ pdfName }) => {
      const html = `<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8">
<style>@page { size: A4; margin: 20mm } body { font-family: "Segoe UI", Tahoma; font-size: 13pt }</style>
<h1>INIMD Lite — تصدير PDF</h1><p>اختبار عربي: مرحباً بالعالم.</p><p>English text mixed in.</p></html>`
      return await window.api.exportPdf({
        html,
        defaultName: pdfName,
        pageSize: 'A4',
        pageNumbers: false,
        margin: 20
      })
    },
    { pdfName: 'smoke' }
  )
  report.pdfFile = existsSync(pdfPath)
    ? { exists: true, size: statSync(pdfPath).size }
    : { exists: false }

  // تصدير Word (توليد docx داخل WebView ثم كتابته عبر Rust)
  report.docx = await page.evaluate(async () => {
    return await window.api.exportDocx({
      markdown: '# عنوان\n\nنص عربي **عريض** مع جدول:\n\n| أ | ب |\n| --- | --- |\n| 1 | 2 |\n',
      baseDir: '',
      defaultName: 'smoke',
      rtl: true
    })
  })
  report.docxFile = existsSync(docxPath)
    ? {
        exists: true,
        size: statSync(docxPath).size,
        zip: readFileSync(docxPath).subarray(0, 2).toString() === 'PK'
      }
    : { exists: false }

  await page.evaluate(async () => {
    const current = await window.api.getSettings()
    await window.api.setSettings({ ...current, language: 'ar' })
    window.api.confirmClose(true)
  })
  await sleep(600)
} catch (error) {
  report.failure = String(error)
} finally {
  try {
    await browser.close()
  } catch {
    /* ignore */
  }
  try {
    child.kill()
  } catch {
    /* ignore */
  }
}

console.log(JSON.stringify(report, null, 2))
if (report.failure || report.errors.length) process.exitCode = 1
