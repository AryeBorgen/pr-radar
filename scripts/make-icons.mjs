// Renders the shipped icon files from the two sources in media/.
//
// Chromium is already a development dependency for the browser tests, so the
// icons come out of the renderer that will display them rather than out of an
// image library added for six files.
//
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const icon = readFileSync(join(root, 'media/icon.svg'), 'utf8')
const out = join(root, 'public/icons')
mkdirSync(out, { recursive: true })

// No maskable-specific padding. media/icon.svg is already drawn for the crop:
// every feature sits within 20 units of the centre, and the dish deliberately
// runs past that so a masked edge looks intentional. Insetting it again would
// shrink the mark and leave it floating in a field of green, which is the
// failure the safe zone exists to avoid rather than a second line of defence.
const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const { file, size } of sizes) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0}
     svg{display:block;width:${size}px;height:${size}px}</style>${icon}`,
  )
  writeFileSync(join(out, file), await page.screenshot({ omitBackground: false }))
  console.log(`  ${file}  ${size}x${size}`)
}

// The .ico browsers still ask for by convention: one 32x32 PNG in an ICO
// wrapper, which every current browser reads.
const png32 = readFileSync(join(out, 'favicon-32.png'))
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt8(32, 6)
header.writeUInt8(32, 7)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png32.length, 14)
header.writeUInt32LE(22, 18)
writeFileSync(join(root, 'public/favicon.ico'), Buffer.concat([header, png32]))
console.log('  favicon.ico')

// The vector favicon, served as-is for displays that can use it.
writeFileSync(join(out, 'icon.svg'), icon)
console.log('  icon.svg')

await browser.close()
