import { expect, test, type Page, type Route } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * Keeping a signed-in session alive.
 *
 * An OAuth App can be set to expire its tokens, which hands back a refresh
 * token and an eight-hour lifetime. Everything here is about what happens at
 * the far end of those eight hours -- which is a failure that arrives long
 * after the decision that caused it, and so is exactly the kind nobody notices
 * until a user reports being logged out mid-afternoon.
 *
 * The clock is moved rather than waited on: the expiry is set two seconds out
 * so the timer fires during the test.
 */

const CODE = {
  device_code: 'dev-code',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 1,
}

/** Stand in for the relay, recording every token request it receives. */
async function relay(page: Page, replies: unknown[]) {
  const seen: Record<string, unknown>[] = []
  await page.route('**/auth/config', (r) => r.fulfill({ json: { deviceFlow: true, clientId: 'Iv1.x' } }))
  await page.route('**/auth/device/code', (r) => r.fulfill({ json: CODE }))
  let index = 0
  await page.route('**/auth/device/token', (route: Route) => {
    seen.push(route.request().postDataJSON())
    const body = replies[Math.min(index, replies.length - 1)]
    index += 1
    route.fulfill({ json: body })
  })
  return seen
}

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue to the radar' }).click()
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click()
  await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible({ timeout: 15000 })
}

test.describe('an expiring session', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHub(page)
  })

  test('renews itself before the token expires', async ({ page }) => {
    const seen = await relay(page, [
      { access_token: 'gho_first', refresh_token: 'ghr_first', expires_in: 2 },
      { access_token: 'gho_second', refresh_token: 'ghr_second', expires_in: 28800 },
    ])
    await signIn(page)

    await expect
      .poll(() => seen.filter((r) => r['grant_type'] === 'refresh_token').length, { timeout: 15000 })
      .toBe(1)
    expect(seen.at(-1)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'ghr_first',
    })
  })

  // The point of refreshing at all: requests after it must carry the new token.
  test('the new token is the one GitHub then sees', async ({ page }) => {
    const authorizations: string[] = []
    await page.route('https://api.github.com/**', async (route: Route) => {
      const header = route.request().headers()['authorization']
      if (header) authorizations.push(header)
      await route.fallback()
    })
    await relay(page, [
      { access_token: 'gho_first', refresh_token: 'ghr_first', expires_in: 2 },
      { access_token: 'gho_second', refresh_token: 'ghr_second', expires_in: 28800 },
    ])
    await signIn(page)

    await expect
      .poll(() => authorizations.some((h) => h.includes('gho_second')), { timeout: 20000 })
      .toBe(true)
  })

  /*
   * GitHub invalidates a refresh token the moment it is used, so a session that
   * kept the old one works exactly once and then signs the user out a day
   * later. This is the assertion that would have caught that.
   */
  test('uses the new refresh token next time, not the spent one', async ({ page }) => {
    const seen = await relay(page, [
      { access_token: 'gho_first', refresh_token: 'ghr_first', expires_in: 2 },
      { access_token: 'gho_second', refresh_token: 'ghr_second', expires_in: 2 },
      { access_token: 'gho_third', refresh_token: 'ghr_third', expires_in: 28800 },
    ])
    await signIn(page)

    const refreshes = () => seen.filter((r) => r['grant_type'] === 'refresh_token')
    await expect.poll(() => refreshes().length, { timeout: 25000 }).toBeGreaterThanOrEqual(2)
    expect(refreshes()[1]).toMatchObject({ refresh_token: 'ghr_second' })
  })

  /*
   * Being asked to sign in is something a person can act on. A dashboard that
   * silently stops updating is not.
   *
   * The dashboard is deliberately not waited for here. `expires_in: 2` is
   * already past the five-minute refresh margin, so the refresh is due the
   * instant the session exists and fires before the first render settles --
   * which is correct, and makes "signed in, then signed out" unobservable. What
   * matters is the end state, plus proof that a refresh was actually attempted:
   * without that second assertion this would also pass if the sign-in had
   * simply failed.
   */
  test('signs the user out when a refresh is refused', async ({ page }) => {
    const seen = await relay(page, [
      { access_token: 'gho_first', refresh_token: 'ghr_first', expires_in: 2 },
      { error: 'bad_refresh_token' },
    ])
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByRole('button', { name: 'Sign in with GitHub' }).click()

    // Wait for the refresh to have been refused before asking whether the
    // session survived it, in that order: the token field is visible on the
    // sign-in screen the whole time, so "signed out" is not something the page
    // can be asked about directly.
    await expect
      .poll(() => seen.filter((r) => r['grant_type'] === 'refresh_token').length, { timeout: 20000 })
      .toBe(1)

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('pr-radar.token.v1')), { timeout: 10000 })
      .toBeNull()
    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
  })

  // A pasted token has no refresh token and no expiry. Nothing should be
  // scheduled for it, and nothing should be sent.
  test('a pasted token is never refreshed', async ({ page }) => {
    const seen = await relay(page, [{ error: 'should_not_be_called' }])
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue to the radar' }).click()
    await page.getByLabel('GitHub personal access token').fill('ghp_pasted')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('button', { name: 'Repositories' })).toBeVisible()

    await page.waitForTimeout(3000)
    expect(seen.filter((r) => r['grant_type'] === 'refresh_token')).toHaveLength(0)
  })
})
