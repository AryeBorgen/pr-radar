import { expect, test, type Page } from '@playwright/test'
import { mockGitHub, pull, skipIntro, VIEWER } from './fixtures/github'

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
/** The narrowest screen still in use, and where the row defects showed. */
const SMALL_PHONE = { width: 320, height: 700 }

/*
 * A label and a requested reviewer, because that is what broke.
 *
 * The default fixtures carry neither, so the row measurements below would have
 * asserted against a row that has nothing to wrap -- passing without ever
 * rendering the thing they exist to catch.
 */
const PULLS = [
  pull({ number: 412, title: 'Add a keyboard shortcut for the filter box', author: 'hubot' }),
  pull({
    number: 409,
    title: 'Waiting on my review',
    requestedReviewers: [VIEWER],
    labels: [{ name: 'needs-review-from-the-platform-team', color: 'd93f0b' }],
  }),
  pull({ number: 401, title: 'A draft that is still cooking', draft: true, author: VIEWER }),
]

async function dashboard(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await mockGitHub(page, { pulls: PULLS })
  await skipIntro(page)
  await page.addInitScript(() => {
    localStorage.setItem(
      'pr-radar.settings.v1',
      JSON.stringify({ repos: [{ owner: 'acme', name: 'web' }], views: [], refreshInterval: 0 }),
    )
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

  /*
   * The row, at the narrowest width anybody still browses on.
   *
   * The chrome was the first problem and these were the second: with the
   * screen cut down, the rows themselves fell apart. Both were plainly visible
   * in a screenshot and invisible to every assertion in this file, which is the
   * same way the 715 pixels above went unnoticed. Measured at 320 because that
   * is where they showed; they were present and milder at 390.
   */
  test('no line of a row is nothing but separators', async ({ page }) => {
    await dashboard(page, SMALL_PHONE)

    // Group the meta line's parts by the line they landed on, and ask whether
    // any line carries an actual word. A `·` alone on a line is the failure:
    // the separators used to be siblings in a wrapping flex row, free to wrap
    // away from the thing they separate.
    const lines = await page.evaluate(() => {
      const meta = document.querySelectorAll('li')[1]?.querySelectorAll('div')[3]
      const byTop = new Map<number, string>()
      for (const child of meta?.children ?? []) {
        const top = Math.round(child.getBoundingClientRect().top)
        byTop.set(top, (byTop.get(top) ?? '') + (child.textContent ?? ''))
      }
      return [...byTop.values()]
    })

    expect(lines.length).toBeGreaterThan(1) // or the test proves nothing
    for (const line of lines) {
      expect(/\p{L}|\p{N}/u.test(line), `a line of the meta reads "${line.trim()}"`).toBe(true)
    }
  })

  test('a label is never broken in half', async ({ page }) => {
    await dashboard(page, SMALL_PHONE)

    /*
     * A chip is a name, and a name is one line.
     *
     * Two things had to be got right for this to measure anything. The label is
     * longer than the column it sits in, because a short one fits whether or
     * not it is allowed to break. And the assertion is on *height*: a chip is a
     * flex item, so `getClientRects()` reports a single border box however many
     * lines of text are stacked inside it -- the first version of this test
     * counted rects, got 1, and passed cheerfully against a chip rendering four
     * lines deep as an orange blob.
     */
    const chip = page.locator('span', { hasText: /^needs-review-from-the-platform-team$/ }).first()
    await expect(chip).toBeVisible()
    const height = await chip.evaluate((el) => el.getBoundingClientRect().height)

    expect(height, `the label is ${Math.round(height)}px tall, so it wrapped`).toBeLessThan(30)
  })

  // The query box is the one filter worth its own row on a phone: it is how you
  // express what the axes cannot, and hiding it behind the panel would put the
  // most capable control furthest away.
  test('the filter box stays on screen', async ({ page }) => {
    await dashboard(page, PHONE)

    await expect(page.getByLabel('Filter pull requests')).toBeVisible()
  })
})

/**
 * The same phone, in Hebrew, with a title nobody would choose to write.
 *
 * Every measurement above was taken in English, left to right, on titles this
 * project made up -- and the layout that passed all of them scrolled sideways
 * on a real account, reported from an iPhone at 440px. A pull request title is
 * somebody else's text: a branch name, a package path, a pasted URL. One token
 * that cannot break sets the row's width, the row sets the page's, and the
 * dashboard has to be dragged left and right to be read.
 *
 * Hebrew is in here because that is the direction the report came from and
 * because nothing else in this file runs right to left, not because the defect
 * needs it -- it does not.
 */
test.describe('on a phone, in Hebrew, with hostile content', () => {
  const HOSTILE = [
    pull({
      number: 950,
      title: 'Fix ThisIsOneEnormousUnbreakableIdentifierNobodyShouldHaveWritten',
      author: 'a-very-long-service-account-name[bot]',
      labels: [{ name: 'infrastructure-and-deployment', color: 'd4c5f9' }],
    }),
    pull({
      number: 951,
      title: 'See https://github.com/acme/web/actions/runs/33996193622/job/101387061106',
      requestedReviewers: [VIEWER, 'octocat', 'platform-team-lead', 'someone-else'],
    }),
  ]

  async function hebrew(page: Page) {
    await page.setViewportSize({ width: 440, height: 956 })
    await skipIntro(page)
    await mockGitHub(page, { pulls: HOSTILE })
    await page.addInitScript(() => {
      localStorage.setItem('pr-radar.locale', 'he')
      localStorage.setItem(
        'pr-radar.settings.v1',
        JSON.stringify({
          repos: [{ owner: 'acme', name: 'web-and-platform-services-shared' }],
          views: [],
          refreshInterval: 0,
        }),
      )
      sessionStorage.setItem('pr-radar.token.v1', JSON.stringify({ token: 'ghp_t' }))
    })
    await page.goto('/')
    await expect(page.locator('li').first()).toBeVisible({ timeout: 15000 })
  }

  test('the page does not scroll sideways, whatever the titles say', async ({ page }) => {
    await hebrew(page)

    // Named, not just counted: "the page is 128px too wide" sends you looking
    // through the whole tree, and the element that did it is one query away.
    const report = await page.evaluate(() => {
      const de = document.documentElement
      const culprits: string[] = []
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        const out = r.right > de.clientWidth + 1 || r.left < -1
        const childOut = [...el.children].some((c) => {
          const cr = c.getBoundingClientRect()
          return cr.right > de.clientWidth + 1 || cr.left < -1
        })
        if (out && !childOut) culprits.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 40)}"`)
      }
      return { overflow: de.scrollWidth - de.clientWidth, culprits: culprits.slice(0, 5) }
    })

    expect(
      report.overflow,
      `the page is ${report.overflow}px wider than the screen. Widest: ${report.culprits.join(' | ')}`,
    ).toBeLessThanOrEqual(0)
  })

  test('it really is rendering right to left', async ({ page }) => {
    await hebrew(page)
    // Or the test above would be measuring the English layout under a Hebrew name.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
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
