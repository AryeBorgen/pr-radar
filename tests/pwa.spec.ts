import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { mockGitHub, signIn } from './fixtures/github'

const MARKER = '<!--rebuilt-->'

/**
 * Installability is a checklist a browser applies silently: get one item wrong
 * and the install prompt simply never appears, with no error anywhere. Each
 * item is asserted here rather than trusted.
 */

test.describe('the web app manifest', () => {
  test('is linked and parses', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()

    const response = await request.get(href!)
    expect(response.status()).toBe(200)

    const manifest = await response.json()
    expect(manifest.name).toBe('PR Radar')
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toBeTruthy()
  })

  test('declares the icon sizes a browser requires to offer an install', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await (await request.get(href!)).json()

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')

    // Android crops an icon to the platform's shape. Without a maskable variant
    // it crops the plain one and takes the edges of the artwork with it.
    const maskable = manifest.icons.filter((i: { purpose: string }) => i.purpose === 'maskable')
    expect(maskable.length).toBeGreaterThan(0)
  })

  test('every icon it names actually resolves', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await (await request.get(href!)).json()
    const base = new URL(href!, page.url())

    for (const icon of manifest.icons) {
      const url = new URL(icon.src, base).href
      const response = await request.get(url)
      expect(response.status(), `${icon.src} should be served`).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
    }
  })

  test('iOS has the tags it reads instead of the manifest', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    )
    const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(icon).toBeTruthy()
    expect((await request.get(icon!)).status()).toBe(200)
  })
})

// A service worker is registered per origin, and these tests register, claim and
// clear caches on the same one. Run in parallel they tear down each other's
// setup; the failure looks like flakiness and is not.
test.describe.configure({ mode: 'serial' })

test.describe('the service worker', () => {
  test('registers and takes control', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return registration.active?.state ?? 'none'
    })
    expect(state).toBe('activated')
  })

  test('serves the shell with no network at all', async ({ page, context }) => {
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    // Give the worker a load to cache the document and its assets.
    await page.reload()
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    await context.setOffline(true)
    await page.reload()

    // The application renders. What it can say about GitHub is another matter.
    await expect(page.locator('#root')).not.toBeEmpty()
    await context.setOffline(false)
  })

  test('does not keep a stale copy of anybody’s pull requests', async ({ page, context }) => {
    // The design decision this test exists to hold: a cached pull request list
    // is a wrong pull request list, shown without saying so, in a dashboard
    // whose only job is telling you what is waiting on you now.
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      const urls: string[] = []
      for (const name of names) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) urls.push(request.url)
      }
      return urls
    })

    // Compare origins rather than searching for a substring: `api.github.com`
    // appears in https://evil.example/api.github.com too, and a check that can
    // be fooled in either direction is not a check. CodeQL flagged the first
    // version of this line, and was right to.
    const own = new URL(page.url()).origin
    const foreign = cached.filter((url) => new URL(url).origin !== own)
    expect(foreign, 'the worker must cache nothing from another origin').toEqual([])

    // It should, however, be holding the immutable assets -- that is the point.
    expect(cached.some((url) => new URL(url).pathname.startsWith('/assets/'))).toBe(true)
  })

  test('a new build replaces the cached document rather than being shadowed by it', async ({
    page,
  }) => {
    // Answering the document from cache would pin a visitor to one bundle
    // forever -- the failure `Cache-Control: no-cache` already exists to
    // prevent.
    //
    // Proving this needs a real change on the wire. `page.route` cannot help:
    // it does not intercept requests the service worker itself issues, which
    // was measured rather than assumed -- an earlier version of this test
    // counted zero intercepts and drew the wrong conclusion from them. So the
    // file the server is actually serving is edited, and restored afterwards.
    const index = join(process.cwd(), 'dist', 'index.html')
    const original = await readFile(index, 'utf8')

    try {
      await mockGitHub(page)
      await page.goto('/')
      await page.evaluate(() => navigator.serviceWorker.ready)
      await page.reload()
      expect(await page.content()).not.toContain(MARKER)

      await writeFile(index, original.replace('</head>', `${MARKER}</head>`))
      await page.reload()

      // Cache-first would still be serving the copy taken on the reload above.
      expect(await page.content()).toContain(MARKER)
    } finally {
      await writeFile(index, original)
    }
  })
})
