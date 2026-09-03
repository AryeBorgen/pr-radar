import type { Actor, CheckState, PullRequest, RepoRef } from '../types'

const GRAPHQL_URL = 'https://api.github.com/graphql'

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

/**
 * Fields for one pull request. Every `first:` here is a node-count multiplier
 * against GitHub's 500,000-node ceiling per request, so each one is set to what
 * the UI actually reads rather than to the maximum allowed.
 *
 * `first: 100` on the PR connection is GitHub's per-page ceiling; a repo with
 * more open PRs is truncated to the 100 most recently updated, which is what
 * the dashboard sorts by anyway.
 */
const PR_FIELDS = `
  id
  number
  title
  url
  isDraft
  createdAt
  updatedAt
  additions
  deletions
  changedFiles
  mergeable
  reviewDecision
  author { login avatarUrl }
  labels(first: 10) { nodes { name color } }
  assignees(first: 5) { nodes { login avatarUrl } }
  reviewRequests(first: 10) {
    nodes {
      requestedReviewer {
        __typename
        ... on User { login }
        ... on Team { name }
      }
    }
  }
  reviews(first: 20) { nodes { author { login } } }
  comments { totalCount }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
`

function buildQuery(repos: RepoRef[]): string {
  const parts = repos.map(
    (repo, i) => `
    r${i}: repository(owner: ${JSON.stringify(repo.owner)}, name: ${JSON.stringify(repo.name)}) {
      nameWithOwner
      pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { ${PR_FIELDS} }
      }
    }`,
  )
  return `query { viewer { login } ${parts.join('\n')} }`
}

interface RawPr {
  id: string
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
  mergeable: string
  reviewDecision: string | null
  author: Actor | null
  labels: { nodes: { name: string; color: string }[] }
  assignees: { nodes: Actor[] }
  reviewRequests: { nodes: { requestedReviewer: { login?: string; name?: string } | null }[] }
  reviews: { nodes: { author: { login: string } | null }[] }
  comments: { totalCount: number }
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] }
}

/**
 * GitHub reports more rollup states than are worth six separate icons. ERROR is
 * a failure by any practical reading, and EXPECTED means a required check has
 * been announced but not yet reported — pending.
 */
function toCheckState(state: string | undefined): CheckState {
  switch (state) {
    case 'SUCCESS':
      return 'SUCCESS'
    case 'FAILURE':
    case 'ERROR':
      return 'FAILURE'
    case 'PENDING':
    case 'EXPECTED':
      return 'PENDING'
    default:
      return 'NONE'
  }
}

function normalise(raw: RawPr, repo: string): PullRequest {
  const decision = raw.reviewDecision
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    repo,
    isDraft: raw.isDraft,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    author: raw.author,
    labels: raw.labels.nodes,
    assignees: raw.assignees.nodes,
    requestedReviewers: raw.reviewRequests.nodes
      .map((n) => n.requestedReviewer?.login ?? n.requestedReviewer?.name)
      .filter((n): n is string => Boolean(n)),
    reviewedBy: [
      ...new Set(
        raw.reviews.nodes.map((n) => n.author?.login).filter((l): l is string => Boolean(l)),
      ),
    ],
    reviewDecision:
      decision === 'APPROVED' || decision === 'CHANGES_REQUESTED' || decision === 'REVIEW_REQUIRED'
        ? decision
        : null,
    checkState: toCheckState(raw.commits.nodes[0]?.commit.statusCheckRollup?.state),
    comments: raw.comments.totalCount,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    mergeable:
      raw.mergeable === 'MERGEABLE' || raw.mergeable === 'CONFLICTING' ? raw.mergeable : 'UNKNOWN',
  }
}

export interface FetchResult {
  viewer: string
  pullRequests: PullRequest[]
  /** Repositories that failed to load, with GitHub's reason. */
  errors: { repo: string; message: string }[]
}

async function graphql<T>(token: string, query: string): Promise<{ data: T; errors?: GraphQLError[] }> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (response.status === 401) {
    throw new GitHubError('GitHub rejected the token. It may be expired or revoked.', 401)
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub returned ${response.status} ${response.statusText}`, response.status)
  }
  return response.json()
}

interface GraphQLError {
  type?: string
  message: string
  path?: (string | number)[]
}

async function fetchBatch(token: string, repos: RepoRef[]): Promise<FetchResult> {
  const body = await graphql<Record<string, unknown>>(token, buildQuery(repos))

  const pullRequests: PullRequest[] = []
  const errors: { repo: string; message: string }[] = []

  repos.forEach((ref, i) => {
    const slug = `${ref.owner}/${ref.name}`
    const node = body.data?.[`r${i}`] as
      | { nameWithOwner: string; pullRequests: { nodes: RawPr[] } }
      | null
      | undefined
    if (!node) {
      const reason = body.errors?.find((e) => e.path?.[0] === `r${i}`)
      errors.push({ repo: slug, message: reason?.message ?? 'Repository not found or not accessible.' })
      return
    }
    for (const raw of node.pullRequests.nodes) {
      pullRequests.push(normalise(raw, node.nameWithOwner))
    }
  })

  // Errors with no path point at the request as a whole, not a single repo.
  for (const error of body.errors ?? []) {
    if (!error.path) errors.push({ repo: '', message: error.message })
  }

  const viewer = (body.data?.viewer as { login: string } | undefined)?.login ?? ''
  return { viewer, pullRequests, errors }
}

/**
 * Repositories per request, and requests in flight at once.
 *
 * A single query over every repository is tempting but breaks twice over: at
 * roughly 4,700 nodes per repository, a list of more than ~100 repositories
 * exceeds GitHub's 500,000-node limit and is rejected outright — and adding a
 * whole organisation can add 100 repositories in one click. Batching keeps each
 * request small; the concurrency cap keeps a large list from tripping GitHub's
 * secondary rate limits.
 */
const REPOS_PER_REQUEST = 10
const MAX_CONCURRENT_REQUESTS = 3

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

/**
 * Fetch every open PR across `repos`, batching as needed.
 *
 * A repository the token cannot see fails on its own alias rather than failing
 * the whole query: GraphQL nulls that field and reports it in `errors`, so one
 * typo or one revoked grant does not blank the dashboard.
 */
export async function fetchPullRequests(token: string, repos: RepoRef[]): Promise<FetchResult> {
  if (repos.length === 0) return { viewer: '', pullRequests: [], errors: [] }

  const batches = chunk(repos, REPOS_PER_REQUEST)
  const results: FetchResult[] = []

  for (const group of chunk(batches, MAX_CONCURRENT_REQUESTS)) {
    results.push(...(await Promise.all(group.map((batch) => fetchBatch(token, batch)))))
  }

  return {
    viewer: results.find((result) => result.viewer)?.viewer ?? '',
    pullRequests: results.flatMap((result) => result.pullRequests),
    errors: results.flatMap((result) => result.errors),
  }
}

/** Expand an org or user login into its non-archived repositories. */
export async function fetchOwnerRepos(token: string, login: string): Promise<RepoRef[]> {
  const query = `query {
    repositoryOwner(login: ${JSON.stringify(login)}) {
      repositories(first: 100, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes { name owner { login } }
      }
    }
  }`
  const body = await graphql<{
    repositoryOwner: { repositories: { nodes: { name: string; owner: { login: string } }[] } } | null
  }>(token, query)

  const owner = body.data?.repositoryOwner
  if (!owner) {
    throw new GitHubError(`No user or organisation named "${login}" is visible to this token.`)
  }
  return owner.repositories.nodes.map((n) => ({ owner: n.owner.login, name: n.name }))
}

/** Verify a token and return the login it belongs to. */
export async function fetchViewer(token: string): Promise<string> {
  const body = await graphql<{ viewer: { login: string } }>(token, 'query { viewer { login } }')
  const login = body.data?.viewer?.login
  if (!login) throw new GitHubError('Token accepted but no user could be read from it.')
  return login
}
