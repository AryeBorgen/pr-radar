import { expect, test } from '@playwright/test'
import { mockGitHub, signIn } from './fixtures/github'

/**
 * Adding an owner that turns out to be empty used to be a dead end. The report
 * was accurate -- "no repositories this token can see" -- and it reads as a
 * permissions problem, so it sent people to check their token. The actual cause
 * was usually a name belonging to somebody else: typing `DePoint` finds a real
 * GitHub user with no public repositories, when the organisation wanted was
 * `DePointLTD`.
 */

/** An owner lookup where the org 404s and the user exists but is empty. */
async function emptyUser(page: import('@playwright/test').Page, login: string) {
  await page.route(`https://api.github.com/orgs/${login}/repos**`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  )
  await page.route(`https://api.github.com/users/${login}/repos**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
}

async function viewerOrgs(page: import('@playwright/test').Page, logins: string[]) {
  await page.route('https://api.github.com/user/orgs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(logins.map((login) => ({ login }))),
    }),
  )
}

test.describe('adding an owner that has nothing in it', () => {
  test('says it found a user rather than an organisation', async ({ page }) => {
    await mockGitHub(page)
    await emptyUser(page, 'DePoint')
    await viewerOrgs(page, ['DePointLTD'])
    await signIn(page, [])
    await page.goto('/')

    await page.getByPlaceholder(/owner\/repo/i).fill('DePoint')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText(/is a GitHub user, not an organisation/i)).toBeVisible()
  })

  test('offers the organisation that was probably meant', async ({ page }) => {
    await mockGitHub(page)
    await emptyUser(page, 'DePoint')
    await viewerOrgs(page, ['DePointLTD', 'Bizi-IL', 'CivikaHQ'])
    await signIn(page, [])
    await page.goto('/')

    await page.getByPlaceholder(/owner\/repo/i).fill('DePoint')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('button', { name: 'DePointLTD' })).toBeVisible()
    // Only the plausible one. Offering every organisation would be noise.
    await expect(page.getByRole('button', { name: 'CivikaHQ' })).toBeHidden()
  })

  test('clicking the suggestion puts it in the box ready to add', async ({ page }) => {
    await mockGitHub(page)
    await emptyUser(page, 'DePoint')
    await viewerOrgs(page, ['DePointLTD'])
    await signIn(page, [])
    await page.goto('/')

    const field = page.getByPlaceholder(/owner\/repo/i)
    await field.fill('DePoint')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: 'DePointLTD' }).click()

    await expect(field).toHaveValue('DePointLTD')
    await expect(page.getByText(/is a GitHub user/i)).toBeHidden()
  })

  test('offers nothing when nothing is close', async ({ page }) => {
    await mockGitHub(page)
    await emptyUser(page, 'facebook')
    await viewerOrgs(page, ['DePointLTD', 'Bizi-IL'])
    await signIn(page, [])
    await page.goto('/')

    await page.getByPlaceholder(/owner\/repo/i).fill('facebook')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText(/is a GitHub user/i)).toBeVisible()
    await expect(page.getByText(/did you mean/i)).toBeHidden()
  })

  test('an empty organisation is reported as an organisation', async ({ page }) => {
    await mockGitHub(page)
    await page.route('https://api.github.com/orgs/Hollow/repos**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await viewerOrgs(page, [])
    await signIn(page, [])
    await page.goto('/')

    await page.getByPlaceholder(/owner\/repo/i).fill('Hollow')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText(/The organisation "Hollow" has no repositories/i)).toBeVisible()
  })
})
