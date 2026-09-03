import type { Page, Route } from '@playwright/test'

/**
 * A stand-in for api.github.com.
 *
 * Mocking GitHub is right for a test about this application's behaviour and
 * wrong for a test about whether GitHub can be reached at all -- the whole
 * GraphQL data layer once passed a smoke test that mocked the endpoint whose
 * CORS headers were the problem. `reachability.spec.ts` deliberately does not
 * install this.
 */

export const VIEWER = 'octocat'

interface PullOptions {
  number: number
  title: string
  author?: string
  draft?: boolean
  labels?: { name: string; color: string }[]
  requestedReviewers?: string[]
  updatedAt?: string
}

function user(login: string) {
  return { login, avatar_url: `https://avatars.githubusercontent.com/${login}` }
}

export function pull(options: PullOptions) {
  const at = options.updatedAt ?? '2026-09-01T10:00:00Z'
  return {
    id: options.number * 1000,
    number: options.number,
    title: options.title,
    html_url: `https://github.com/acme/web/pull/${options.number}`,
    draft: options.draft ?? false,
    state: 'open',
    merged_at: null,
    closed_at: null,
    created_at: at,
    updated_at: at,
    user: user(options.author ?? 'hubot'),
    head: { sha: `sha${options.number}` },
    labels: options.labels ?? [],
    assignees: [],
    requested_reviewers: (options.requestedReviewers ?? []).map(user),
    requested_teams: [],
  }
}

export const DEFAULT_PULLS = [
  pull({ number: 1, title: 'Add a keyboard shortcut for the filter box', author: 'hubot' }),
  pull({ number: 2, title: 'Waiting on my review', requestedReviewers: [VIEWER] }),
  pull({ number: 3, title: 'A draft that is still cooking', draft: true, author: VIEWER }),
]

export interface MockOptions {
  pulls?: unknown[]
  /** Reviews keyed by pull number; anything absent comes back as an empty list. */
  reviews?: Record<number, { state: string; user: { login: string }; submitted_at: string }[]>
  /** Check runs keyed by head SHA. */
  checkRuns?: Record<string, { status: string; conclusion: string | null }[]>
}

/**
 * Route every api.github.com call to a local answer. Anything not explicitly
 * handled fails loudly rather than silently returning an empty body, so a test
 * cannot pass because the app quietly asked for something nobody mocked.
 */
export async function mockGitHub(page: Page, options: MockOptions = {}) {
  const pulls = options.pulls ?? DEFAULT_PULLS

  await page.route('https://api.github.com/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })

    if (path === '/user') return json({ login: VIEWER })

    if (/^\/repos\/[^/]+\/[^/]+\/pulls$/.test(path)) {
      return json(url.searchParams.get('state') === 'closed' ? [] : pulls)
    }

    const review = path.match(/^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/reviews$/)
    if (review) return json(options.reviews?.[Number(review[1])] ?? [])

    const checks = path.match(/^\/repos\/[^/]+\/[^/]+\/commits\/([^/]+)\/check-runs$/)
    if (checks) return json({ check_runs: options.checkRuns?.[checks[1]] ?? [] })

    if (/^\/(orgs|users)\/[^/]+\/repos$/.test(path)) {
      return json([{ name: 'web', archived: false, owner: { login: 'acme' } }])
    }

    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ message: `unmocked GitHub route: ${path}` }),
    })
  })
}

/** Put the app past the token gate with one repository already configured. */
export async function signIn(page: Page, repos = [{ owner: 'acme', name: 'web' }]) {
  await page.addInitScript(
    ([token, settings]) => {
      sessionStorage.setItem('pr-radar.token.v1', token as string)
      localStorage.setItem('pr-radar.settings.v1', settings as string)
    },
    ['ghp_testtoken', JSON.stringify({ repos, views: [], refreshInterval: 120 })],
  )
}
