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

/**
 * Why the login needs a relay, asked of GitHub rather than remembered.
 *
 * This is the fact the entire device-flow design rests on, so it is measured on
 * every run. If GitHub ever puts CORS headers on these endpoints, this test goes
 * red and the relay can be deleted -- which is the outcome we would want to hear
 * about. The `access-control-allow-origin` note in CLAUDE.md was wrong once
 * already, discovered exactly this way.
 *
 * Served from a page carrying no Content-Security-Policy, deliberately. The
 * application's own policy names only api.github.com, so running this against
 * the app would prove the policy works and say nothing about GitHub.
 */
test.describe('reaching GitHub OAuth from a browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/no-policy.html', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>no policy</title>' }),
    )
    await page.goto('http://127.0.0.1:41730/no-policy.html')
  })

  test('the device-code endpoint refuses a browser outright', async ({ page }) => {
    const outcome = await page.evaluate(async () => {
      try {
        const response = await fetch('https://github.com/login/device/code', {
          method: 'POST',
          // Form-encoded on purpose: a "simple request" triggers no preflight,
          // so a rejection here is the response missing the header, not the
          // preflight being refused. There is no weaker request to try.
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'client_id=Iv1.0000000000000000&scope=repo',
        })
        return { read: true, status: response.status }
      } catch (error) {
        return { read: false, message: (error as Error).message }
      }
    })

    expect(
      outcome.read,
      'github.com/login/device/code now allows a browser to read its response -- ' +
        'the relay in bin/pr-radar.js and docker/nginx.conf may no longer be needed',
    ).toBe(false)
  })

  test('the request is delivered; it is the reply that cannot be read', async ({ page }) => {
    // The distinction matters. A blocked request would mean a network or policy
    // problem that some other transport might dodge. An opaque *response* means
    // the browser will never hand the page the device code, whatever we try --
    // which is what makes a relay the only option rather than the easy one.
    const type = await page.evaluate(async () => {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=Iv1.0000000000000000',
      })
      return { type: response.type, status: response.status }
    })

    expect(type).toEqual({ type: 'opaque', status: 0 })
  })

  test('the CORS-enabled host does not serve the OAuth endpoints', async ({ page }) => {
    // api.github.com answers cross-origin requests happily, so the natural
    // question is whether the flow can simply be pointed at it. It cannot.
    const status = await page.evaluate(async () => {
      const response = await fetch('https://api.github.com/login/device/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=Iv1.0000000000000000',
      })
      return response.status
    })

    expect(status).toBe(404)
  })
})

