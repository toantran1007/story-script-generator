// Đóng gói các PNG (đã xuất sẵn trong build/) thành build/icon.ico.
// ICO chứa PNG nén trực tiếp — Windows Vista trở lên đọc được.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZES = [16, 32, 48, 64, 128, 256]

const images = SIZES.map((size) => ({
  size,
  data: readFileSync(join(ROOT, 'build', `icon-${size}.png`))
}))

const HEADER = 6
const ENTRY = 16
const header = Buffer.alloc(HEADER)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)

let offset = HEADER + ENTRY * images.length
const entries = []
for (const img of images) {
  const e = Buffer.alloc(ENTRY)
  e.writeUInt8(img.size === 256 ? 0 : img.size, 0) // width (0 = 256)
  e.writeUInt8(img.size === 256 ? 0 : img.size, 1) // height
  e.writeUInt8(0, 2) // colors in palette
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // planes
  e.writeUInt16LE(32, 6) // bit depth
  e.writeUInt32LE(img.data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += img.data.length
  entries.push(e)
}

const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
writeFileSync(join(ROOT, 'build', 'icon.ico'), ico)
console.log(`build/icon.ico — ${images.length} cỡ, ${ico.length.toLocaleString()} bytes`)
