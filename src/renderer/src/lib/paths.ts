const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/

export function dirnameOf(filePath: string): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return normalized.slice(0, index + 1)
  return normalized.slice(0, index)
}

export function baseNameOf(filePath: string): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  return name || normalized
}

export function stripExtension(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}

export function resolveLocalPath(href: string, baseDir: string): string | null {
  if (!href) return null
  let clean = href.split('#')[0].split('?')[0].trim()
  if (!clean) return null

  if (clean.startsWith('file://')) {
    try {
      clean = decodeURIComponent(clean.replace(/^file:\/\/\/?/i, ''))
      if (WINDOWS_DRIVE.test(clean)) return clean.replace(/\//g, '\\')
      return clean
    } catch {
      return null
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) && !WINDOWS_DRIVE.test(clean)) return null

  const normalized = clean.replace(/\\/g, '/')
  if (WINDOWS_DRIVE.test(normalized)) return normalized.replace(/\//g, '\\')

  if (normalized.startsWith('/')) {
    if (/^\/[A-Za-z]:\//.test(normalized)) return normalized.slice(1).replace(/\//g, '\\')
    return normalized
  }

  const base = (baseDir || '').replace(/\\/g, '/')
  if (!base) return null

  const parts = `${base}/${normalized}`.split('/')
  const stack: string[] = []

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (stack.length) stack.pop()
      continue
    }
    stack.push(part)
  }

  return stack.join('\\')
}

export function toAssetUrl(absolutePath: string): string {
  return `inimd://file/?path=${encodeURIComponent(absolutePath)}`
}

export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href)
}
