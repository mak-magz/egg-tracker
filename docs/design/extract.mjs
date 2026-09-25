// Unpacks the Claude Design bundle export into readable source files.
// Usage: node docs/design/extract.mjs  →  writes docs/design/source/
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, 'Tamago Egg Farm Tracker.html'), 'utf8')
const block = (type) => {
  const m = html.match(new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`))
  return m ? JSON.parse(m[1]) : null
}

const manifest = block('manifest') ?? {}
const template = block('template')
const pageOrder = block('page_order') ?? []

const EXT = {
  'text/html': 'html', 'text/css': 'css', 'text/javascript': 'js', 'application/javascript': 'js',
  'application/json': 'json', 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg',
  'image/webp': 'webp', 'font/woff2': 'woff2', 'font/woff': 'woff', 'text/x-dc': 'dc.html',
}

const out = join(here, 'source')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'assets'), { recursive: true })

const index = []
for (const [uuid, entry] of Object.entries(manifest)) {
  let bytes = Buffer.from(entry.data, 'base64')
  if (entry.compressed) bytes = gunzipSync(bytes)
  const ext = EXT[entry.mime] ?? 'bin'
  const isPage = pageOrder.includes(uuid)
  const file = isPage ? `page-${pageOrder.indexOf(uuid)}.${ext}` : `assets/${uuid}.${ext}`
  writeFileSync(join(out, file), bytes)
  index.push({ uuid, mime: entry.mime, bytes: bytes.length, file })
}
if (template) writeFileSync(join(out, 'template.html'), typeof template === 'string' ? template : JSON.stringify(template, null, 2))
writeFileSync(join(out, 'index.json'), JSON.stringify(index.sort((a, b) => a.file.localeCompare(b.file)), null, 2))
console.log(`Extracted ${index.length} assets${template ? ' + template.html' : ''} to docs/design/source/`)
for (const i of index) console.log(`${String(i.bytes).padStart(9)}  ${i.mime.padEnd(24)} ${i.file}`)
