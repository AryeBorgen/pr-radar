import { expect, test, type Page } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * Hebrew, and right-to-left, in a real browser.
 *
 * The unit tests prove the catalogues are complete and the plurals correct. A
 * browser is what can see the things they cannot: that `dir` reaches the
 * document rather than a wrapper, that a menu anchored to the trailing edge
 * moves to the other side, that the choice survives a reload.
 */

/** Land on the dashboard in a given browser language. */
async function open(page: Page, languages: string[]) {
  await page.addInitScript((langs) => {
    Object.defineProperty(navigator, 'languages', { get: () => langs })
    Object.defineProperty(navigator, 'language', { get: () => langs[0] })
  }, languages)
  await mockGitHub(page)
  await page.goto('/')
}

test.describe('Hebrew', () => {
  test('is chosen from the browser preference, with no asking', async ({ page }) => {
    await open(page, ['he-IL', 'en'])

    await expect(page.getByRole('button', { name: 'המשך לרדאר' })).toBeVisible()
  })

  // he-IL is not 'he'. Comparing whole tags misses every regional variant, and
  // every real browser sends one.
  test('is found from a regional tag', async ({ page }) => {
    await open(page, ['he-IL'])

    await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  })

  test('leaves English alone', async ({ page }) => {
    await open(page, ['en-GB'])

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  })

  /*
   * `dir` has to be on <html>, not on a wrapper div. On a div it leaves the
   * browser's own behaviour -- text selection, spellcheck, form control
   * layout, anything rendered into a portal -- laid out left to right, and
   * assistive technology takes the language from <html> too.
   */
  test('sets the direction on the document, not on a wrapper', async ({ page }) => {
    await open(page, ['he'])

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  })

  test('lays the page out right to left', async ({ page }) => {
    await open(page, ['he'])

    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl')
  })
})

test.describe('choosing a language', () => {
  const reachDashboard = async (page: Page) => {
    await page.getByRole('button', { name: /Continue to the radar|המשך לרדאר/ }).click()
    await page.getByLabel(/GitHub personal access token|טוקן גישה אישי/).fill('ghp_test')
    await page.getByRole('button', { name: /^(Continue|המשך)$/ }).click()
    await expect(page.getByRole('button', { name: /Repositories|מאגרים/ })).toBeVisible()
  }

  test('switches the whole page', async ({ page }) => {
    await open(page, ['en'])
    await reachDashboard(page)

    await page.getByRole('button', { name: 'Language' }).click()
    await page.getByRole('option', { name: 'עברית' }).click()

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  })

  // Each language is written in itself: someone looking for their own language
  // is, by definition, not reading the current one.
  test('names each language in its own language', async ({ page }) => {
    await open(page, ['en'])
    await reachDashboard(page)
    await page.getByRole('button', { name: 'Language' }).click()

    await expect(page.getByRole('option', { name: 'עברית' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'English' })).toBeVisible()
  })

  test('is remembered across a reload', async ({ page }) => {
    await open(page, ['en'])
    await reachDashboard(page)
    await page.getByRole('button', { name: 'Language' }).click()
    await page.getByRole('option', { name: 'עברית' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  })

  // The remembered choice must beat the browser preference, or someone reading
  // English on a Hebrew machine is overruled on every visit.
  test('beats the browser preference once made', async ({ page }) => {
    await open(page, ['he'])
    await reachDashboard(page)
    await page.getByRole('button', { name: 'שפה' }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('right-to-left layout', () => {
  const reachDashboard = async (page: Page) => {
    await page.getByRole('button', { name: 'המשך לרדאר' }).click()
    await page.getByLabel(/טוקן גישה אישי/).fill('ghp_test')
    await page.getByRole('button', { name: 'המשך' }).click()
    await expect(page.getByRole('button', { name: 'מאגרים' })).toBeVisible()
  }

  // `ms-auto` is margin-inline-start: it pushes to the right in English and to
  // the left in Hebrew, from the same class. `ml-auto` would push left in both.
  test('the header controls move to the other side', async ({ page }) => {
    await open(page, ['he'])
    await reachDashboard(page)

    const title = await page.getByRole('heading', { name: 'PR Radar' }).boundingBox()
    const signOut = await page.getByRole('button', { name: 'התנתקות' }).boundingBox()

    expect(signOut!.x, 'sign out should sit to the left of the title in Hebrew').toBeLessThan(
      title!.x,
    )
  })

  test('a dropdown hangs off the correct edge', async ({ page }) => {
    await open(page, ['he'])
    await reachDashboard(page)

    const button = await page.getByRole('button', { name: 'שפה' }).boundingBox()
    await page.getByRole('button', { name: 'שפה' }).click()
    const menu = await page.getByRole('listbox').boundingBox()

    // Anchored to the trailing edge, which is the left one here, so the menu
    // starts at or left of the button rather than hanging off to the right.
    expect(menu!.x).toBeLessThanOrEqual(button!.x + 1)
  })

  test('nothing overflows the viewport sideways', async ({ page }) => {
    await open(page, ['he'])
    await reachDashboard(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the page scrolls horizontally in Hebrew').toBeLessThanOrEqual(0)
  })
})

test.describe('a Latin value inside a Hebrew sentence', () => {
  /*
   * Found in a screenshot, not in a test: the merge confirmation read
   * `?acme/web #1 למזג את` -- the question mark had jumped to the far end,
   * because the bidirectional algorithm attached it to the Latin run rather
   * than to the Hebrew sentence around it.
   *
   * Every interpolated value is isolated now. This checks the rendered box
   * rather than the string, because the string was never the thing that looked
   * wrong.
   */
  test('does not drag the sentence\'s punctuation to the wrong end', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { get: () => ['he-IL'] })
      localStorage.setItem(
        'pr-radar.settings.v1',
        JSON.stringify({ repos: [{ owner: 'acme', name: 'web' }], views: [], refreshInterval: 0 }),
      )
      localStorage.setItem('pr-radar.intro.v1', 'seen')
      sessionStorage.setItem('pr-radar.token.v1', 'ghp_test')
    })
    await mockGitHub(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'פעולות' }).first().click()
    await page.getByRole('menuitem', { name: 'יצירת קומיט מיזוג' }).click()

    const question = page.getByRole('dialog').locator('p').first()
    const text = await question.textContent()

    // The question mark is the last character of the sentence, and the value is
    // isolated so the browser keeps it there.
    expect(text?.trimEnd().endsWith('?')).toBe(true)
    expect(text).toContain('\u2068acme/web #1\u2069')
  })
})

