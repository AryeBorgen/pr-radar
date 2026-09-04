import type {
  Actor,
  CheckState,
  Enrichment,
  PullRequest,
  PullState,
  RepoRef,
  ReviewDecision,
} from '../types'

const API = 'https://api.github.com'

/**
 * Why REST and not GraphQL.
 *
 * GitHub's GraphQL endpoint sends no `Access-Control-Allow-Origin` header at
 * all, so a browser cannot call it — the preflight fails and `fetch` rejects
 * before any request is made. No client-side change fixes that; it would take a
 * server to proxy, which is exactly what this app is built to avoid. The REST
 * API does support CORS (`Access-Control-Allow-Origin: *`), so everything here
 * goes through REST.
 *
 * The cost is that REST's pull-request list omits review decision and check
 * state, so those are fetched per PR in a second pass. See `fetchEnrichment`.
 */

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

async function rest<T>(token: string, path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  } catch {
    // `fetch` rejects only for network-level failures: offline, DNS, blocked by
    // an extension, or a CORS preflight that never passed.
    throw new GitHubError(
      'Could not reach api.github.com. Check your connection, and whether a browser extension is blocking the request.',
    )
  }

  if (response.status === 401) {
    throw new GitHubError('GitHub rejected the token. It may be expired or revoked.', 401)
  }
  if (response.status === 403 || response.status === 429) {
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      const when = Number.isFinite(reset) ? new Date(reset * 1000).toLocaleTimeString() : 'shortly'
      throw new GitHubError(`GitHub rate limit reached. It resets at ${when}.`, response.status)
    }
    throw new GitHubError(
      'GitHub refused the request. The token may lack the scopes for this repository.',
      response.status,
    )
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub returned ${response.status} ${response.statusText}`, response.status)
  }
  return response.json() as Promise<T>
}

/* ------------------------------------------------------------------ listing */

interface RawUser {
  login: string
  avatar_url: string
}

interface RawPull {
  id: number
  number: number
  title: string
  html_url: string
  draft?: boolean
  state: string
  merged_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  user: RawUser | null
  head: { sha: string }
  labels: { name: string; color: string }[]
  assignees: RawUser[] | null
  requested_reviewers: RawUser[] | null
  requested_teams: { name: string }[] | null
}

function toActor(user: RawUser): Actor {
  return { login: user.login, avatarUrl: user.avatar_url }
}

/** REST reports `state: closed` for merged and abandoned alike; `merged_at` separates them. */
function toState(raw: RawPull): PullState {
  if (raw.state === 'open') return 'OPEN'
  return raw.merged_at ? 'MERGED' : 'CLOSED'
}

function normalise(raw: RawPull, repo: string): PullRequest {
  return {
    id: String(raw.id),
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    repo,
    state: toState(raw),
    mergedAt: raw.merged_at,
    closedAt: raw.closed_at,
    headSha: raw.head.sha,
    isDraft: Boolean(raw.draft),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    author: raw.user ? toActor(raw.user) : null,
    labels: raw.labels.map((label) => ({ name: label.name, color: label.color })),
    assignees: (raw.assignees ?? []).map(toActor),
    requestedReviewers: [
      ...(raw.requested_reviewers ?? []).map((user) => user.login),
      ...(raw.requested_teams ?? []).map((team) => team.name),
    ],
    reviewedBy: [],
    reviewDecision: 'UNKNOWN',
    checkState: 'UNKNOWN',
  }
}

export interface FetchResult {
  pullRequests: PullRequest[]
  /** Repositories that failed to load, with the reason. */
  errors: { repo: string; message: string }[]
  /** Repositories whose closed PRs hit the per-repository page cap. */
  truncated: string[]
}

/**
 * Requests in flight at once.
 *
 * One request per repository is unavoidable on REST, so a large list means many
 * requests. Six at a time keeps a 100-repository list moving without tripping
 * GitHub's secondary rate limits, which react to burst concurrency rather than
 * to the hourly quota.
 */
const MAX_CONCURRENT_REQUESTS = 6

/** Run `task` over `items`, at most `limit` at a time, preserving input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Closed pull requests fetched per repository: one page, no pagination.
 *
 * Closed PRs accumulate without bound, so the scope is bounded twice over — by
 * this cap and by the Period filter — and whichever bites first wins. One page
 * of 100 keeps it to a single extra request per repository; going deeper would
 * mean pagination per repository, which on a large organisation is hundreds of
 * requests for history nobody scrolled to.
 *
 * When a repository fills this page and its oldest row is still inside the
 * selected period, there may be more that were not fetched — `truncated` says
 * so rather than letting the list look complete.
 */
const CLOSED_PAGE_SIZE = 100

/**
 * Fetch pull requests across `repos`.
 *
 * `includeClosed` costs a second request per repository, so it is driven by the
 * Status axis rather than always on: a dashboard that is open all day should not
 * pay for merge history nobody asked to see.
 *
 * A repository that fails is reported by name and does not take the others with
 * it, so one typo or one revoked grant cannot blank the dashboard.
 */
export async function fetchPullRequests(
  token: string,
  repos: RepoRef[],
  includeClosed = false,
): Promise<FetchResult> {
  if (repos.length === 0) return { pullRequests: [], errors: [], truncated: [] }

  const outcomes = await mapLimit(repos, MAX_CONCURRENT_REQUESTS, async (ref) => {
    const slug = `${ref.owner}/${ref.name}`
    const base = `/repos/${ref.owner}/${ref.name}/pulls`
    try {
      const requests = [
        rest<RawPull[]>(token, `${base}?state=open&per_page=100&sort=updated&direction=desc`),
      ]
      if (includeClosed) {
        requests.push(
          rest<RawPull[]>(
            token,
            `${base}?state=closed&per_page=${CLOSED_PAGE_SIZE}&sort=updated&direction=desc`,
          ),
        )
      }
      const [open, closed] = await Promise.all(requests)
      return {
        pulls: [...open, ...(closed ?? [])].map((pull) => normalise(pull, slug)),
        truncated: (closed?.length ?? 0) >= CLOSED_PAGE_SIZE ? slug : undefined,
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Request failed.'
      return { error: { repo: slug, message } }
    }
  })

  return {
    pullRequests: outcomes.flatMap((outcome) => outcome.pulls ?? []),
    errors: outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : [])),
    truncated: outcomes.flatMap((outcome) => (outcome.truncated ? [outcome.truncated] : [])),
  }
}

/* --------------------------------------------------------------- enrichment */

interface RawReview {
  user: RawUser | null
  state: string
  submitted_at: string | null
}

/**
 * Collapse a review list into a single decision.
 *
 * Only the most recent decisive review per person counts — GitHub works the
 * same way, so an approval that follows a change request supersedes it. Comment
 * and pending reviews express no verdict and are skipped entirely.
 */
export function decideReview(
  reviews: RawReview[],
  hasOutstandingRequest: boolean,
): { reviewedBy: string[]; reviewDecision: ReviewDecision } {
  const latest = new Map<string, string>()
  const reviewedBy = new Set<string>()

  for (const review of reviews) {
    const login = review.user?.login
    if (!login) continue
    reviewedBy.add(login)
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      latest.set(login, review.state)
    } else if (review.state === 'DISMISSED') {
      latest.delete(login)
    }
  }

  const verdicts = [...latest.values()]
  const reviewDecision: ReviewDecision = verdicts.includes('CHANGES_REQUESTED')
    ? 'CHANGES_REQUESTED'
    : verdicts.includes('APPROVED')
      ? 'APPROVED'
      : hasOutstandingRequest
        ? 'REVIEW_REQUIRED'
        : 'NONE'

  return { reviewedBy: [...reviewedBy], reviewDecision }
}

interface RawCheckRun {
  status: string
  conclusion: string | null
}

const FAILING_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
])

/**
 * Collapse check runs into one state. A run that has not completed outranks a
 * passing one, and any failure outranks everything: the dashboard exists to
 * surface the bad news, so it must never round a failure up to green.
 */
export function rollupChecks(runs: RawCheckRun[]): CheckState {
  if (runs.length === 0) return 'NONE'
  if (runs.some((run) => run.conclusion && FAILING_CONCLUSIONS.has(run.conclusion))) return 'FAILURE'
  if (runs.some((run) => run.status !== 'completed')) return 'PENDING'
  return 'SUCCESS'
}

/**
 * Fetch the review decision and check state for one pull request.
 *
 * Two requests, deliberately: the single-PR endpoint would also give line
 * counts and mergeability, but that is a third round trip per PR for cosmetic
 * fields, and on a list of this size the request budget is better spent on the
 * two signals that drive buckets.
 */
export async function fetchEnrichment(token: string, pr: PullRequest): Promise<Enrichment> {
  const [owner, name] = pr.repo.split('/')

  const [reviews, checks] = await Promise.all([
    rest<RawReview[]>(token, `/repos/${owner}/${name}/pulls/${pr.number}/reviews?per_page=100`),
    rest<{ check_runs: RawCheckRun[] }>(
      token,
      `/repos/${owner}/${name}/commits/${pr.headSha}/check-runs?per_page=100`,
    ),
  ])

  return {
    ...decideReview(reviews, pr.requestedReviewers.length > 0),
    checkState: rollupChecks(checks.check_runs),
  }
}

/* -------------------------------------------------------------------- setup */

/** Verify a token and return the login it belongs to. */
export async function fetchViewer(token: string): Promise<string> {
  const user = await rest<{ login: string }>(token, '/user')
  if (!user.login) throw new GitHubError('Token accepted but no user could be read from it.')
  return user.login
}

interface RawRepo {
  name: string
  archived: boolean
  owner: { login: string }
}

export interface OwnerRepos {
  /**
   * Which endpoint answered. Carried out of here because an empty result means
   * very different things for the two, and the caller cannot tell them apart
   * from an empty array.
   */
  kind: 'organisation' | 'user'
  repos: RepoRef[]
}

/**
 * Expand an org or user login into its non-archived repositories. The org
 * endpoint is tried first and a 404 falls through to the user endpoint, because
 * nothing in a bare login says which of the two it is.
 */
export async function fetchOwnerRepos(token: string, login: string): Promise<OwnerRepos> {
  const query = 'per_page=100&sort=pushed&direction=desc'
  let repos: RawRepo[]
  let kind: OwnerRepos['kind'] = 'organisation'

  try {
    repos = await rest<RawRepo[]>(token, `/orgs/${login}/repos?type=all&${query}`)
  } catch (cause) {
    if (!(cause instanceof GitHubError) || cause.status !== 404) throw cause
    kind = 'user'
    try {
      repos = await rest<RawRepo[]>(token, `/users/${login}/repos?type=owner&${query}`)
    } catch (inner) {
      if (inner instanceof GitHubError && inner.status === 404) {
        throw new GitHubError(`No user or organisation named "${login}" is visible to this token.`)
      }
      throw inner
    }
  }

  return {
    kind,
    repos: repos
      .filter((repo) => !repo.archived)
      .map((repo) => ({ owner: repo.owner.login, name: repo.name })),
  }
}

/** The organisations the token's owner belongs to, for suggesting a correction. */
export async function fetchViewerOrgs(token: string): Promise<string[]> {
  const orgs = await rest<{ login: string }[]>(token, '/user/orgs?per_page=100')
  return orgs.map((org) => org.login)
}

/**
 * Organisations the viewer belongs to that resemble what they typed.
 *
 * The case this exists for: typing `DePoint` finds a real, unrelated GitHub user
 * with no public repositories. The lookup succeeds, returns nothing, and the
 * honest report -- "no repositories this token can see" -- sounds like a
 * permissions problem and sends people to check their token. The organisation
 * they meant was `DePointLTD` all along.
 *
 * Substring in either direction, because the miss is usually a suffix that was
 * left off or a longer name that was half remembered. Everything plausible is
 * returned rather than one guess: choosing between `Bizi-IL` and `Buildix-IL` is
 * the reader's job, not this function's.
 */
export function suggestOwners(typed: string, orgs: string[]): string[] {
  const needle = typed.trim().toLowerCase()
  if (!needle) return []
  return orgs.filter((org) => {
    const name = org.toLowerCase()
    if (name === needle) return false
    return name.includes(needle) || needle.includes(name)
  })
}
