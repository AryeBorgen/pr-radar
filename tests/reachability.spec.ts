import { expect, test } from '@playwright/test'

/**
 * The one test here that must not mock api.github.com.
 *
 * This project was originally built on GitHub's GraphQL API and had to be
 * rewritten, because `api.github.com/graphql` sends no Access-Control-Allow-Origin
 * header at all: the preflight fails and `fetch` rejects before a request is
 * ever made. The smoke test of the day passed throughout, because it mocked the
 * very endpoint whose CORS behaviour was the defect.
 *
 * So this asks a real browser to make a real cross-origin request and reports
 * what actually happens.
 */

test.describe('reaching GitHub from a browser', () => {
  test('the REST API answers a cross-origin request', async ({ page }) => {
    await page.goto('/')

    const outcome = await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.github.com/rate_limit')
        return { ok: true, status: response.status }
      } catch (error) {
        return { ok: false, error: `${(error as Error).name}: ${(error as Error).message}` }
      }
    })

    // A rejected promise is the CORS failure mode and is always a real problem.
    // A 403 is an unauthenticated rate limit -- GitHub answered, which is the
    // only thing being asked here.
    expect(outcome, `fetch failed outright: ${'error' in outcome ? outcome.error : ''}`).toMatchObject({ ok: true })
    expect([200, 401, 403, 429]).toContain((outcome as { status: number }).status)
  })

  test('the REST API allows an Authorization header on a preflighted request', async ({ page }) => {
    // The header is what turns a simple request into a preflighted one. A server
    // can permit the origin and still refuse the header, and this application is
    // useless if it does.
    await page.goto('/')

    const outcome = await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.github.com/rate_limit', {
          headers: { Authorization: 'Bearer not-a-real-token', Accept: 'application/vnd.github+json' },
        })
        return { ok: true, status: response.status }
      } catch (error) {
        return { ok: false, error: `${(error as Error).name}: ${(error as Error).message}` }
      }
    })

    expect(outcome, `preflight with Authorization failed: ${'error' in outcome ? outcome.error : ''}`).toMatchObject({ ok: true })
    // 401 is the expected answer to a made-up token, and it is proof the request
    // arrived rather than being stopped by the browser.
    expect([401, 403, 429]).toContain((outcome as { status: number }).status)
  })
})
