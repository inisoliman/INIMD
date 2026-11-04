import { BrowserWindow, app, dialog } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import type { ExportPdfPayload, ExportResult } from '../shared/types'

function footerTemplate(): string {
  return `<div style="width:100%;padding:0 14mm;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:9px;color:#8b8b8b;text-align:center;direction:rtl;">
    صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>
  </div>`
}

export async function exportPdf(
  parent: BrowserWindow,
  payload: ExportPdfPayload,
  suggestedDir: string
): Promise<ExportResult> {
  let targetPath = process.env['MIDAD_PDF_OUT'] ?? ''

  if (!targetPath) {
    const target = await dialog.showSaveDialog(parent, {
      title: 'تصدير إلى PDF',
      defaultPath: join(suggestedDir || app.getPath('documents'), `${payload.defaultName}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (target.canceled || !target.filePath) return { ok: false, canceled: true }
    targetPath = target.filePath
  }

  const tempDir = await fs.mkdtemp(join(tmpdir(), 'midad-pdf-'))
  const htmlPath = join(tempDir, 'document.html')
  let printWindow: BrowserWindow | null = null

  try {
    await fs.mkdir(dirname(targetPath), { recursive: true }).catch(() => undefined)
    await fs.writeFile(htmlPath, payload.html, 'utf8')
    if (process.env['MIDAD_HTML_OUT']) {
      await fs.writeFile(process.env['MIDAD_HTML_OUT'], payload.html, 'utf8').catch(() => undefined)
    }

    printWindow = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        webSecurity: true
      }
    })
    printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    await printWindow.loadFile(htmlPath)
    // Give the compositor a moment to lay out system fonts and images.
    await new Promise((resolve) => setTimeout(resolve, 400))

    const useHeaderFooter = payload.pageNumbers === true

    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: payload.pageSize,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      displayHeaderFooter: useHeaderFooter,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate()
    })

    await fs.writeFile(targetPath, pdf)
    return { ok: true, path: targetPath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
