// يحوّل مخرَج Tauri إلى نسخة محمولة: ملف تنفيذي واحد قابل للتوزيع دون تثبيت.
// التشغيل: npm --prefix lite run portable
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lite = resolve(here, '..')
const root = resolve(lite, '..')

const version = JSON.parse(readFileSync(join(lite, 'package.json'), 'utf8')).version

const candidates = [
  join(lite, 'src-tauri', 'target', 'release', 'inimd-lite.exe'),
  join(lite, 'src-tauri', 'target', 'release', 'INIMD Lite.exe')
]
const source = candidates.find((candidate) => existsSync(candidate))
if (!source) {
  console.error('لم يُعثر على الملف التنفيذي. ابنِ أولاً: npm --prefix lite run dist')
  process.exit(1)
}

const outDir = join(root, 'release')
mkdirSync(outDir, { recursive: true })
const target = join(outDir, `INIMD-Lite-${version}-portable.exe`)
copyFileSync(source, target)

console.log(
  JSON.stringify(
    {
      ok: true,
      version,
      source,
      portable: target,
      size: statSync(target).size,
      megabytes: Number((statSync(target).size / 1024 / 1024).toFixed(2))
    },
    null,
    2
  )
)
