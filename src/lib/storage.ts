import type { Bucket, RepoRef, Settings } from '../types'

const SETTINGS_KEY = 'pr-radar.settings.v1'
const TOKEN_KEY = 'pr-radar.token.v1'

/**
 * The default buckets. These encode the reason this dashboard exists: GitHub can
 * already list pull requests, but it cannot tell you, across every repository at
 * once, which ones are actually waiting on you.
 */
export const DEFAULT_BUCKETS: Bucket[] = [
  { id: 'review', name: 'Needs my review', query: 'review-requested:@me' },
  {
    id: 'changes',
    name: 'My PRs · changes requested',
    query: 'author:@me review:changes_requested',
  },
  { id: 'red', name: 'My PRs · CI failing', query: 'author:@me checks:failure' },
  { id: 'mergeable', name: 'Approved · ready to merge', query: 'review:approved -is:draft' },
  { id: 'stale', name: 'Stale · untouched 7d+', query: '-is:draft updated:<7d' },
  { id: 'mine', name: 'Everything I opened', query: 'author:@me' },
  { id: 'all', name: 'All open', query: '' },
]

export const DEFAULT_SETTINGS: Settings = {
  repos: [],
  buckets: DEFAULT_BUCKETS,
  refreshInterval: 120,
}

function isRepoRef(value: unknown): value is RepoRef {
  const ref = value as RepoRef
  return typeof ref?.owner === 'string' && typeof ref?.name === 'string'
}

function isBucket(value: unknown): value is Bucket {
  const bucket = value as Bucket
  return (
    typeof bucket?.id === 'string' &&
    typeof bucket?.name === 'string' &&
    typeof bucket?.query === 'string'
  )
}

/**
 * Reads are defensive because localStorage is shared, hand-editable, and
 * survives across versions of the app: anything malformed falls back to the
 * default rather than throwing on load and leaving a blank page.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      repos: Array.isArray(parsed.repos) ? parsed.repos.filter(isRepoRef) : [],
      buckets:
        Array.isArray(parsed.buckets) && parsed.buckets.length > 0
          ? parsed.buckets.filter(isBucket)
          : DEFAULT_BUCKETS,
      refreshInterval:
        typeof parsed.refreshInterval === 'number' && parsed.refreshInterval >= 0
          ? parsed.refreshInterval
          : DEFAULT_SETTINGS.refreshInterval,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // A full or blocked store costs the user their layout, not their session.
  }
}

/**
 * The token lives in sessionStorage, not localStorage: it is cleared when the
 * tab closes, which keeps a credential off disk on a shared machine. The cost
 * is re-pasting it in a new tab, which is the right trade for a static app that
 * has no server to hold a session for it.
 */
export function loadToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to do: the user simply re-enters it on the next load.
  }
}

/** Accepts `owner/name`, a full GitHub URL, or `git@` remote syntax. */
export function parseRepoInput(input: string): RepoRef | null {
  const cleaned = input
    .trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')

  const match = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/.exec(cleaned)
  if (!match) return null
  return { owner: match[1], name: match[2] }
}

export function repoKey(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`.toLowerCase()
}
