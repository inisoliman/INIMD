import type { Settings } from '@shared/types'

const HLJS_CSS = `
.hljs{color:#243230;background:transparent}
.hljs-comment,.hljs-quote{color:#7c8a84;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type{color:#9c3d00}
.hljs-string,.hljs-regexp,.hljs-addition{color:#0f6b52}
.hljs-number,.hljs-built_in,.hljs-symbol{color:#7a3ea0}
.hljs-title,.hljs-section,.hljs-name{color:#1b5d8a;font-weight:600}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable{color:#8a4b1f}
.hljs-meta,.hljs-selector-id,.hljs-selector-class{color:#5c6b8a}
.hljs-deletion{color:#b1372f}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:700}
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface PrintOptions {
  html: string
  title: string
  settings: Settings
  rtl: boolean
}

export function buildPrintDocument({ html, title, settings, rtl }: PrintOptions): string {
  const pageMargin = settings.margin
  const pageMarginBottom = settings.pageNumbers ? settings.margin + 6 : settings.margin
  const fontPt = Math.max(9, settings.fontSize - 2.5)
  const lineHeight = settings.lineHeight
  const direction = rtl ? 'rtl' : 'ltr'
  const align = rtl ? 'right' : 'left'

  return `<!doctype html>
<html lang="ar" dir="${direction}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: ${settings.pageSize}; margin: ${pageMargin}mm ${pageMargin}mm ${pageMarginBottom}mm ${pageMargin}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: "${settings.fontFamily}", "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: ${fontPt}pt;
    line-height: ${lineHeight};
    color: #17201d;
    direction: ${direction};
    text-align: ${align};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .md-body { padding: 0; max-width: none; }
  .md-body > *:first-child { margin-top: 0; }
  .md-body p { margin: 0 0 0.75em; orphans: 3; widows: 3; }
  .md-body h1, .md-body h2, .md-body h3,
  .md-body h4, .md-body h5, .md-body h6 {
    color: #123b30;
    font-weight: 700;
    line-height: 1.45;
    margin: 1.4em 0 0.55em;
    break-after: avoid;
    page-break-after: avoid;
  }
  .md-body h1 { font-size: 1.9em; border-bottom: 2px solid #cfe0d8; padding-bottom: 0.2em; }
  .md-body h2 { font-size: 1.55em; border-bottom: 1px solid #dde8e2; padding-bottom: 0.15em; }
  .md-body h3 { font-size: 1.3em; }
  .md-body h4 { font-size: 1.14em; }
  .md-body h5 { font-size: 1.05em; }
  .md-body h6 { font-size: 1em; color: #4c5b55; }
  .md-body a { color: #0d6b54; text-decoration: underline; text-underline-offset: 2px; }
  .md-body strong { font-weight: 700; }
  .md-body ul, .md-body ol { margin: 0 0 0.8em; padding-inline-start: 1.6em; }
  .md-body li { margin: 0.18em 0; break-inside: avoid; page-break-inside: avoid; }
  .md-body li > p { margin: 0.2em 0; }
  .md-body ul, .md-body ol { break-inside: auto; }
  .md-body figure, .md-body .table-wrap { break-inside: avoid; page-break-inside: avoid; }
  .md-body blockquote {
    margin: 0.9em 0;
    padding: 0.55em 1em;
    border-inline-start: 3px solid #9fc4b6;
    background: #f4f8f6;
    color: #40524b;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .md-body blockquote > *:last-child { margin-bottom: 0; }
  .md-body pre {
    direction: ltr;
    text-align: left;
    background: #f4f6f5;
    border: 1px solid #e2e8e5;
    border-radius: 6px;
    padding: 10px 12px;
    margin: 0.8em 0;
    font-size: 0.86em;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .md-body pre code { font-family: Consolas, "Courier New", monospace; direction: ltr; unicode-bidi: isolate; }
  .md-body code { font-family: Consolas, "Courier New", monospace; background: #f1f5f3; padding: 0.1em 0.3em; border-radius: 4px; font-size: 0.9em; unicode-bidi: isolate; }
  .md-body pre code { background: none; padding: 0; }
  .md-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.9em 0;
    font-size: 0.94em;
    break-inside: auto;
  }
  .md-body thead { display: table-header-group; }
  .md-body tr { break-inside: avoid; page-break-inside: avoid; }
  .md-body th, .md-body td { border: 1px solid #d7dfdb; padding: 6px 9px; vertical-align: top; }
  .md-body th { background: #eef4f1; font-weight: 700; }
  .md-body img { max-width: 100%; max-height: 300px; height: auto; break-inside: avoid; }
  .md-body hr { border: none; border-top: 1px solid #d9e1dd; margin: 1.4em 0; }
  .md-body input[type="checkbox"] { margin-inline-end: 0.4em; }
  .md-body .task-box {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1px solid #8ba49a;
    border-radius: 2px;
    margin-inline-end: 6px;
    vertical-align: -1px;
    text-align: center;
    font-size: 9px;
    line-height: 10px;
    color: #ffffff;
  }
  .md-body .task-box.checked { background: #0d6b52; border-color: #0d6b52; }
  .md-body .task-list-item { list-style: none; }
  .md-body .footnotes { font-size: 0.88em; color: #4b5a54; border-top: 1px solid #dfe6e2; padding-top: 0.6em; }
  ${HLJS_CSS}
</style>
</head>
<body>
<div class="md-body">${html}</div>
</body>
</html>`
}
