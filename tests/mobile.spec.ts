import { expect, test, type Page } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * The dashboard on a phone.
 *
 * These are measurements, not opinions, and they exist because the problem they
 * describe was invisible to every other test in this suite: nothing overflowed,
 * nothing was clipped, nothing threw. The chrome simply took 715 of an
 * 844-pixel screen, so 85% of a phone was spent before the first pull request.
 * A dashboard you have to scroll past to reach the list is not a dashboard.
 */

const PHONE = { width: 390, height: 844 }

async function dashboard(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await mockGitHub(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      'pr-radar.settings.v1',
      JSON.stringify({ repos: [{ owner: 'acme', name: 'web' }], views: [], refreshInterval: 0 }),
    )
    localStorage.setItem('pr-radar.intro.v1', 'seen')
    sessionStorage.setItem('pr-radar.token.v1', JSON.stringify({ token: 'ghp_t' }))
  })
  await page.goto('/')
  await expect(page.locator('li').first()).toBeVisible({ timeout: 15000 })
}

/** How far down the first pull request sits, as a share of the screen. */
const chromeShare = (page: Page) =>
  page.evaluate(() => {
    const li = document.querySelector('li')
    if (!li) return 1
    return (li.getBoundingClientRect().top + window.scrollY) / document.documentElement.clientHeight
  })

test.describe('on a phone', () => {
  // The number this whole change exists for. Half a screen is the bound; it was
  // measured at 0.34 when this was written, so there is room to grow into
  // before anyone has to think about it again.
  test('the first pull request is in the top half of the screen', async ({ page }) => {
    await dashboard(page, PHONE)

    const share = await chromeShare(page)
    expect(share, `chrome took ${Math.round(share * 100)}% of the screen`).toBeLessThan(0.5)
  })

  test('nothing scrolls sideways', async ({ page }) => {
    await dashboard(page, PHONE)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  /*
   * With the axes hidden, the summary is the only place that state is visible.
   * A control that collapsed them without saying what was set would hide a
   * filter somebody applied and then forgot.
   */
  test('the collapsed control says what is filtering', async ({ page }) => {
    await dashboard(page, PHONE)
    await expect(page.getByTestId('filter-summary')).toContainText('Everything open')

    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('button', { name: /^Mine/ }).click()

    await expect(page.getByTestId('filter-summary')).toContainText('Mine')
  })

  test('the axes are reachable, and hidden again afterwards', async ({ page }) => {
    await dashboard(page, PHONE)
    const axis = page.getByRole('button', { name: /^Awaiting review/ })
    await expect(axis).toBeHidden()

    await page.getByRole('button', { name: 'Filters' }).click()
    await expect(axis).toBeVisible()

    await page.getByRole('button', { name: 'Filters' }).click()
    await expect(axis).toBeHidden()
  })

  // The query box is the one filter worth its own row on a phone: it is how you
  // express what the axes cannot, and hiding it behind the panel would put the
  // most capable control furthest away.
  test('the filter box stays on screen', async ({ page }) => {
    await dashboard(page, PHONE)

    await expect(page.getByLabel('Filter pull requests')).toBeVisible()
  })
})

test.describe('on a desktop', () => {
  // The measurement said the desktop layout was fine, so this asserts the
  // change did not take anything away from it.
  test('every axis is visible without opening anything', async ({ page }) => {
    await dashboard(page, { width: 1280, height: 800 })

    await expect(page.getByRole('button', { name: /^Awaiting review/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters' })).toBeHidden()
  })
})
