import { expect, test, type Page, type Route } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * Merging and closing, from the dashboard.
 *
 * This is the only part of the app that writes, so the tests are mostly about
 * what does *not* happen: no request on a first click, none on a cancel, none
 * on a row that cannot be merged. A merge is not undoable, and the distance
 * between deciding and doing is the feature.
 */

/** Every write GitHub received, so "nothing happened" can be asserted. */
async function trackWrites(page: Page) {
  const writes: { method: string; url: string; body: unknown }[] = []
  await page.route('https://api.github.com/**', async (route: Route) => {
    const method = route.request().method()
    if (method === 'GET') return route.fallback()
    writes.push({
      method,
      url: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    })
    await route.fulfill({ json: { merged: true } })
  })
  return writes
}

async function dashboard(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'pr-radar.settings.v1',
      JSON.stringify({ repos: [{ owner: 'acme', name: 'web' }], views: [], refreshInterval: 0 }),
    )
    localStorage.setItem('pr-radar.intro.v1', 'seen')
    sessionStorage.setItem('pr-radar.token.v1', 'ghp_test')
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()
}

/** The menu on the first row that is a normal open pull request. */
const menu = (page: Page) => page.getByRole('button', { name: 'Actions' }).first()

test.describe('acting on a pull request', () => {
  test('a first click opens a menu and writes nothing', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()

    await expect(page.getByRole('menu')).toBeVisible()
    expect(writes, 'opening a menu must not change anything').toEqual([])
  })

  // The gap between deciding and doing is the whole design. A dashboard is
  // scanned quickly and the rows are a few pixels apart.
  test('choosing merge asks first, and still writes nothing', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Create a merge commit' }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    expect(writes).toEqual([])
  })

  // "Are you sure?" confirms nothing: it is agreed to without being read. The
  // row it refers to is the only thing worth checking.
  test('the question names the repository and the number', async ({ page }) => {
    await mockGitHub(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Create a merge commit' }).click()

    await expect(page.getByRole('dialog')).toContainText('acme/web')
    await expect(page.getByRole('dialog')).toContainText('#1')
  })

  test('cancelling writes nothing', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Create a merge commit' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(writes).toEqual([])
  })

  test('Escape backs out of the question without merging', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Create a merge commit' }).click()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(writes).toEqual([])
  })

  test('confirming merges, with the method and the head SHA', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Squash and merge' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]?.method).toBe('PUT')
    expect(writes[0]?.url).toMatch(/\/pulls\/\d+\/merge$/)
    expect(writes[0]?.body).toMatchObject({ merge_method: 'squash' })
    // The SHA is what makes GitHub answer 409 if someone pushed while the menu
    // was open, rather than landing a commit nobody has seen.
    expect((writes[0]?.body as { sha?: string })?.sha, 'the head SHA must be sent').toBeTruthy()
  })

  test('closing sends a state change, not a merge', async ({ page }) => {
    await mockGitHub(page)
    const writes = await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Close' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toMatchObject({ method: 'PATCH', body: { state: 'closed' } })
  })

  test('the row changes at once, without waiting for a refetch', async ({ page }) => {
    await mockGitHub(page)
    await trackWrites(page)
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Close' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

    await expect(page.getByRole('status')).toContainText('Closed')
  })

  test('a failure says what went wrong', async ({ page }) => {
    await mockGitHub(page)
    await page.route('https://api.github.com/**', async (route: Route) => {
      if (route.request().method() === 'GET') return route.fallback()
      await route.fulfill({ status: 403, json: { message: 'Resource not accessible' } })
    })
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Close' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

    await expect(page.getByRole('status')).toContainText('not allowed to write')
  })

  // An optimistic update that survives a failure is a lie the user will act on.
  test('a failed action puts the row back', async ({ page }) => {
    await mockGitHub(page)
    await page.route('https://api.github.com/**', async (route: Route) => {
      if (route.request().method() === 'GET') return route.fallback()
      await route.fulfill({ status: 403, json: {} })
    })
    await dashboard(page)

    await menu(page).click()
    await page.getByRole('menuitem', { name: 'Close' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('status')).toBeVisible()

    // Still actionable, which it would not be if it were still shown as closed.
    await expect(menu(page)).toBeVisible()
  })

  test('a draft explains why it cannot be merged instead of hiding the option', async ({ page }) => {
    await mockGitHub(page)
    await dashboard(page)

    // The fixture's third pull request is a draft.
    await page.getByRole('button', { name: 'Actions' }).nth(2).click()

    await expect(page.getByRole('menu')).toContainText('draft cannot be merged')
  })
})
