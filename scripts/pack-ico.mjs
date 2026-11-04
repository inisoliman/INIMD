import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'build', 'icons')
const sizes = [256, 128, 64, 48, 32, 24, 16]

function packIcon(prefix) {
  const images = sizes
    .map((size) => {
      const file = join(iconsDir, `${prefix}-${size}.png`)
      if (!existsSync(file)) return null
      return { size, data: readFileSync(file) }
    })
    .filter(Boolean)

  if (!images.length) throw new Error(`No PNG files found for ${prefix}`)

  const headerSize = 6 + images.length * 16
  let offset = headerSize
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  images.forEach((image, index) => {
    const entry = 6 + index * 16
    const dimension = image.size >= 256 ? 0 : image.size
    header.writeUInt8(dimension, entry)
    header.writeUInt8(dimension, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, ...images.map((image) => image.data)])
}

const app = packIcon('app')
const file = packIcon('file')
mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'build', 'icon.ico'), app)
writeFileSync(join(root, 'build', 'file-icon.ico'), file)
writeFileSync(join(root, 'resources', 'icon.ico'), app)

console.log(`icon.ico: ${app.length} bytes`)
console.log(`file-icon.ico: ${file.length} bytes`)
