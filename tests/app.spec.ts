import { expect, test } from '@playwright/test'
import { DEFAULT_PULLS, VIEWER, mockGitHub, pull, signIn } from './fixtures/github'

test.describe('the token gate', () => {
  test('asks for a token before showing anything', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'PR Radar' })).toBeVisible()
    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
    // Nothing about anyone's pull requests before a token exists.
    await expect(page.getByText(DEFAULT_PULLS[0].title)).toBeHidden()
  })

  test('refuses a token GitHub rejects, and says why', async ({ page }) => {
    await page.route('https://api.github.com/user', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    )
    await page.goto('/')

    await page.getByLabel('GitHub personal access token').fill('ghp_wrong')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText(/rejected the token/i)).toBeVisible()
  })

  test('accepts a good token and keeps it out of localStorage', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    await page.getByLabel('GitHub personal access token').fill('ghp_good')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByLabel('GitHub personal access token')).toBeHidden()

    // The token is a credential with a deliberately short life. localStorage
    // would outlive the tab; sessionStorage is the promise the README makes.
    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem('pr-radar.token.v1'),
      local: JSON.stringify(localStorage).includes('ghp_good'),
    }))
    expect(stored.session).toBe('ghp_good')
    expect(stored.local).toBe(false)
  })
})

test.describe('the dashboard', () => {
  test('lists pull requests from the configured repositories', async ({ page }) => {
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')

    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()
  })

  test('shows drafts by default', async ({ page }) => {
    // Not a style preference. A review bot returns a pull request to draft when
    // review fails, so drafts are the ones that need attention, and hiding them
    // hides exactly the wrong set.
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')

    await expect(page.getByText('A draft that is still cooking')).toBeVisible()
  })

  test('renders an author with no avatar without an empty image source', async ({ page }) => {
    // React warns on <img src="">, and a browser may re-request the page for it.
    // Unit tests cannot see this; a browser can.
    const authorless = { ...pull({ number: 9, title: 'No author at all' }), user: null }
    await mockGitHub(page, { pulls: [authorless] })
    await signIn(page)

    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text())
    })

    await page.goto('/')
    await expect(page.getByText('No author at all')).toBeVisible()

    expect(await page.locator('img[src=""]').count()).toBe(0)
    expect(warnings.filter((w) => /src.*empty string/i.test(w))).toEqual([])
  })

  test('reports a repository it cannot see without blanking the rest', async ({ page }) => {
    await mockGitHub(page)
    await page.route('https://api.github.com/repos/secret/vault/pulls**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    )
    await signIn(page, [
      { owner: 'acme', name: 'web' },
      { owner: 'secret', name: 'vault' },
    ])
    await page.goto('/')

    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()
    await expect(page.getByText(/secret\/vault/)).toBeVisible()
  })
})

test.describe('filtering', () => {
  test('the filter box narrows the list', async ({ page }) => {
    await mockGitHub(page)
    await signIn(page)
    await page.goto('/')
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    await page.getByRole('textbox', { name: /filter/i }).fill(`author:${VIEWER}`)

    await expect(page.getByText('A draft that is still cooking')).toBeVisible()
    await expect(page.getByText('Add a keyboard shortcut for the filter box')).toBeHidden()
  })
})
