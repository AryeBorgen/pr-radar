import { expect, test, type Page, type Route } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * The loading bar.
 *
 * Mostly tests about when it is *not* there. A bar that appears for every
 * two-minute poll is a flicker at the top of the screen, and a bar that stays
 * after the work is done is a page that looks permanently busy -- both are
 * worse than no bar at all, and neither is visible in a screenshot of a load.
 */

async function settled(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pr-radar.settings.v1',
      JSON.stringify({ repos: [{ owner: 'acme', name: 'web' }], views: [], refreshInterval: 0 }),
    )
    localStorage.setItem('pr-radar.intro.v1', 'seen')
    sessionStorage.setItem('pr-radar.token.v1', 'ghp_test')
  })
}

const bar = (page: Page) => page.getByTestId('loading-bar')

test.describe('the loading bar', () => {
  test('appears while a slow load is running', async ({ page }) => {
    await settled(page)
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await mockGitHub(page)
    await page.route('**/api.github.com/**pulls**', async (route: Route) => {
      await held
      await route.fallback()
    })

    await page.goto('/')
    await expect(bar(page)).toBeVisible({ timeout: 5000 })

    release?.()
  })

  test('is gone once everything has arrived', async ({ page }) => {
    await settled(page)
    await mockGitHub(page)

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()

    await expect(bar(page)).toHaveCount(0, { timeout: 10_000 })
  })

  /*
   * The requirement that shaped the component. A poll every two minutes that
   * finds nothing new finishes in a few hundred milliseconds; a bar for that is
   * a flash at the top of the screen, forever, for no information.
   */
  test('never flashes for a poll that finds nothing new', async ({ page }) => {
    await settled(page)
    await mockGitHub(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()
    await expect(bar(page)).toHaveCount(0)

    // Watch continuously rather than sampling: a flicker is by definition the
    // thing a single check at the wrong moment misses.
    const appearances = await page.evaluate(async () => {
      let seen = 0
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-testid="loading-bar"]')) seen += 1
      })
      observer.observe(document.body, { childList: true, subtree: true })
      window.dispatchEvent(new Event('focus'))
      await new Promise((r) => setTimeout(r, 2500))
      observer.disconnect()
      return seen
    })

    expect(appearances, 'the bar appeared during a background refetch').toBe(0)
  })

  test('reports a real percentage, not an animation', async ({ page }) => {
    await settled(page)
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await mockGitHub(page)
    await page.route('**/api.github.com/**pulls**', async (route: Route) => {
      await held
      await route.fallback()
    })

    await page.goto('/')
    await expect(bar(page)).toBeVisible({ timeout: 5000 })

    // Before any repository has answered it is at zero, because zero of one has.
    expect(await bar(page).getAttribute('aria-valuenow')).toBe('0')

    release?.()
    await expect(bar(page)).toHaveCount(0, { timeout: 10_000 })
  })

  // It sits above the header in a fixed strip. Anything that pushed the page
  // down would move every row under the reader's cursor as the load finished.
  test('moves nothing else on the page', async ({ page }) => {
    await settled(page)
    await mockGitHub(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()
    const settledTop = await page.getByRole('heading', { name: 'PR Radar' }).boundingBox()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()
    const afterTop = await page.getByRole('heading', { name: 'PR Radar' }).boundingBox()

    expect(afterTop!.y).toBe(settledTop!.y)
  })

  test('says what it is, for a screen reader', async ({ page }) => {
    await settled(page)
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await mockGitHub(page)
    await page.route('**/api.github.com/**pulls**', async (route: Route) => {
      await held
      await route.fallback()
    })

    await page.goto('/')
    const el = page.getByRole('progressbar')
    await expect(el).toHaveAttribute('aria-label', 'Loading pull requests')

    release?.()
  })
})
