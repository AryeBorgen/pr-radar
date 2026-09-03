// Renders the source SVG to the PNG sizes a browser wants for an installed app.
//
// Chromium is already a development dependency for the browser tests, so the
// icons are produced with the renderer that will display them rather than by
// adding an image library for six files.
//
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/icons/radar.svg'), 'utf8')

// A maskable icon is cropped to whatever shape the platform prefers, and the
// crop can take 20% off each edge. Padding the artwork into the safe zone is
// what stops Android shaving the sweep off.
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-maskable-192.png', size: 192, pad: 0.1 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0.04 },
  { file: 'favicon-32.png', size: 32, pad: 0 },
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const { file, size, pad } of targets) {
  const inset = Math.round(size * pad)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><style>
       html,body{margin:0;padding:0;background:#0b1220}
       svg{display:block;width:${size - inset * 2}px;height:${size - inset * 2}px;margin:${inset}px}
     </style>${svg}`,
  )
  const png = await page.screenshot({ omitBackground: false })
  writeFileSync(join(root, 'public/icons', file), png)
  console.log(`  ${file}  ${size}x${size}${pad ? ` (${Math.round(pad * 100)}% safe-zone padding)` : ''}`)
}

// The .ico most browsers still ask for by convention, as a single 32x32 PNG
// wrapped in an ICO header -- every current browser reads PNG-in-ICO.
const png32 = readFileSync(join(root, 'public/icons/favicon-32.png'))
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

await browser.close()
