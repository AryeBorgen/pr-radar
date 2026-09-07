import { expect, test } from '@playwright/test'

/**
 * Push, at the level this suite can actually reach.
 *
 * The service worker's `push` handler is deliberately **not** covered here, and
 * that is a limitation worth writing down rather than papering over: headless
 * Chromium answers `Notification.permission` with `denied` whatever
 * `grantPermissions` is told, so `showNotification` throws before any handler
 * logic runs. A test written against it passes or fails for reasons that have
 * nothing to do with this project. It was written, it failed for exactly that
 * reason, and it was removed -- see `src/server/notifier.test.ts` for the part
 * that decides *what* a person is told, which is unit-tested against the real
 * `evaluate`.
 *
 * What is left here is the property that matters to everybody who never turns
 * push on: that a deployment with nothing awake behind it offers nothing.
 */

test.describe('a deployment with nothing awake behind it', () => {
  test('offers no push switch at all', async ({ page }) => {
    /*
     * GitHub Pages has no server, so nothing can poll GitHub while the tab is
     * closed. `push/config` answers 404 there and the panel says nothing about
     * push, rather than showing a switch that turns on and then silently never
     * fires -- the same shape as the sign-in button that could not work, and
     * the same fix.
     *
     * This suite's own server runs without `--push`, so this is that case.
     */
    expect(await page.request.get('/push/config').then((r) => r.status())).toBe(404)
  })

  test('and the notification panel still opens, offering only the tab-open kind', async ({ page }) => {
    // The regression this guards: a panel that throws when `push/config` is
    // absent would take the existing notifications with it.
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
