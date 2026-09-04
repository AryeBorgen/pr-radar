import { expect, test } from '@playwright/test'
import { mockGitHub, skipIntro } from './fixtures/github'

/**
 * The first thing a stranger meets used to be a password field asking for a
 * GitHub token, with the explanation underneath it. That is the wrong order:
 * the question "why does this want a token" has to be answered before it is
 * asked, or the honest answer -- that it goes nowhere but GitHub -- arrives
 * after the person has already decided not to type anything.
 */

test.describe('the first visit', () => {
  test('explains itself before asking for anything', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'PR Radar' })).toBeVisible()
    // No credential field on the screen a stranger lands on.
    await expect(page.getByLabel('GitHub personal access token')).toBeHidden()
    await expect(page.getByRole('button', { name: /continue to the radar/i })).toBeVisible()
  })

  test('says where the token goes before asking for it', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    // Plain strings rather than patterns: these are looking for text on a page,
    // and an unanchored regex that resembles a host is both less precise and
    // something CodeQL will flag as a URL check that can be fooled.
    await expect(page.getByText('api.github.com')).toBeVisible()
    await expect(page.getByText('no server').first()).toBeVisible()
  })

  test('the button reveals the token field', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')
    await page.getByRole('button', { name: /continue to the radar/i }).click()

    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue to the radar/i })).toBeHidden()
  })

  test('a returning visitor is not introduced again', async ({ page }) => {
    // The token lives in sessionStorage and is gone with the tab, so the token
    // screen is met every session. Being told what the app is every session
    // would be noise.
    await mockGitHub(page)
    await skipIntro(page)
    await page.goto('/')

    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue to the radar/i })).toBeHidden()
  })

  test('reading it once is remembered across sessions', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await mockGitHub(page)
    await page.goto('/')
    await page.getByRole('button', { name: /continue to the radar/i }).click()
    await expect(page.getByLabel('GitHub personal access token')).toBeVisible()

    // A new page in the same context is a new session with the same profile:
    // the token is gone, the introduction is not.
    const second = await context.newPage()
    await mockGitHub(second)
    await second.goto('/')
    await expect(second.getByLabel('GitHub personal access token')).toBeVisible()
    await expect(second.getByRole('button', { name: /continue to the radar/i })).toBeHidden()
    await context.close()
  })

  test('the link to create a token opens GitHub with the scopes filled in', async ({ page }) => {
    await mockGitHub(page)
    await page.goto('/')

    const link = page.getByRole('link', { name: /create a token/i })
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toContain('github.com/settings/tokens/new')
    expect(href).toContain('scopes=')
  })
})
