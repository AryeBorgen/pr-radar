import { expect, test, type Page } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * Signing in, driven the way a person drives it.
 *
 * The relay is mocked here, not GitHub: what is under test is the page's half
 * of the flow. The relay's own half is attacked in tests/node/relay.test.js and
 * compared across both servers in tests/node/conformance.test.js, and whether
 * GitHub still refuses a browser is measured in tests/reachability.spec.ts.
 * Three files because they are three different questions.
 */

const CODE = {
  device_code: 'dev-code-abc',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 1,
}

/** Stand in for the relay. `polls` is what /auth/device/token answers, in order. */
async function relay(page: Page, { available = true, polls = [] as unknown[] } = {}) {
  await page.route('**/auth/config', (route) =>
    available
      ? route.fulfill({ json: { deviceFlow: true, clientId: 'Iv1.test' } })
      : route.fulfill({ status: 404, json: { error: 'device_flow_unavailable' } }),
  )
  await page.route('**/auth/device/code', (route) => route.fulfill({ json: CODE }))
  let index = 0
  await page.route('**/auth/device/token', (route) => {
    const body = polls[Math.min(index, polls.length - 1)] ?? { error: 'authorization_pending' }
    index += 1
    route.fulfill({ json: body })
  })
}

test.describe('signing in with a GitHub account', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHub(page)
  })

  test('is offered where something can relay it', async ({ page }) => {
    await relay(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()

    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible()
  })

  // The static deployment is not broken, it is answering correctly. Offering a
  // button that cannot work would be worse than not offering one.
  test('is not offered where nothing can', async ({ page }) => {
    await relay(page, { available: false })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()

    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toHaveCount(0)
  })

  // The token field is not a fallback that appears when sign-in fails. It works
  // on every deployment, needs nothing configured, and some people prefer it.
  test('never replaces the token field', async ({ page }) => {
    await relay(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()

    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
  })

  test('shows the code to type, and where to type it', async ({ page }) => {
    await relay(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()

    await expect(page.getByTestId('user-code')).toHaveText('WDJB-MJHT')
    await expect(page.getByRole('link', { name: 'github.com/login/device' })).toHaveAttribute(
      'href',
      'https://github.com/login/device',
    )
  })

  test('waits through pending polls and then signs in', async ({ page }) => {
    await relay(page, {
      polls: [
        { error: 'authorization_pending' },
        { error: 'authorization_pending' },
        { access_token: 'gho_signedin' },
      ],
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()

    // The dashboard, which only renders once there is a token.
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible({ timeout: 15000 })
  })

  test('the token it obtains is treated exactly like a pasted one', async ({ page }) => {
    const authorizations: string[] = []
    await page.route('https://api.github.com/**', async (route) => {
      const header = route.request().headers()['authorization']
      if (header) authorizations.push(header)
      await route.fallback()
    })
    await relay(page, { polls: [{ access_token: 'gho_signedin' }] })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible({ timeout: 15000 })

    expect(authorizations.some((h) => h.includes('gho_signedin'))).toBe(true)
  })

  // Same storage as a pasted token, on purpose: a token obtained more
  // conveniently is not a token that deserves to outlive the tab.
  test('the token does not survive the tab', async ({ page, context }) => {
    await relay(page, { polls: [{ access_token: 'gho_signedin' }] })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible({ timeout: 15000 })

    const fresh = await context.newPage()
    await mockGitHub(fresh)
    await relay(fresh)
    await fresh.goto('/')
    await expect(fresh.getByLabel('GitHub personal access token')).toBeVisible()
  })

  test('says so plainly when the sign-in is refused on GitHub', async ({ page }) => {
    await relay(page, { polls: [{ error: 'access_denied' }] })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()

    await expect(page.getByRole('alert')).toContainText('cancelled on GitHub')
  })

  test('can be abandoned and started again', async ({ page }) => {
    await relay(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
    await expect(page.getByTestId('user-code')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('user-code')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible()
  })

  // A flow abandoned mid-poll that keeps polling is a page quietly making
  // requests nobody asked for, and one that would sign the user in later
  // without being asked.
  test('stops polling once abandoned', async ({ page }) => {
    let polls = 0
    await page.route('**/auth/config', (r) => r.fulfill({ json: { deviceFlow: true, clientId: 'x' } }))
    await page.route('**/auth/device/code', (r) => r.fulfill({ json: CODE }))
    await page.route('**/auth/device/token', (r) => {
      polls += 1
      r.fulfill({ json: { error: 'authorization_pending' } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
    await expect(page.getByTestId('user-code')).toBeVisible()
    await expect.poll(() => polls).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Cancel' }).click()
    const after = polls
    await page.waitForTimeout(3000)
    expect(polls, 'polling continued after the flow was abandoned').toBe(after)
  })
})
