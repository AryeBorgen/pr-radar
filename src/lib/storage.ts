import type { RepoRef, SavedView, Settings } from '../types'

const SETTINGS_KEY = 'pr-radar.settings.v1'
const TOKEN_KEY = 'pr-radar.token.v1'
const INTRO_KEY = 'pr-radar.intro.v1'

/**
 * Views start empty. The built-in one-click filters are the facet axes, which
 * are code rather than stored state, so nothing has to be migrated when they
 * change and a user's saved views only ever hold what that user chose to save.
 */
export const DEFAULT_SETTINGS: Settings = {
  repos: [],
  views: [],
  refreshInterval: 120,
}

function isRepoRef(value: unknown): value is RepoRef {
  const ref = value as RepoRef
  return typeof ref?.owner === 'string' && typeof ref?.name === 'string'
}

function isSavedView(value: unknown): value is SavedView {
  const view = value as SavedView
  return (
    typeof view?.id === 'string' && typeof view?.name === 'string' && typeof view?.query === 'string'
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
      views: Array.isArray(parsed.views) ? parsed.views.filter(isSavedView) : [],
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

/**
 * Whether the introduction has been read. In localStorage rather than
 * sessionStorage, and deliberately not with the settings: the token is gone
 * when the tab closes, so the token screen is met again every session, and
 * being told what the app is a second and third time is noise. This is the one
 * piece of state that should outlive the session the token does not.
 */
export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === 'yes'
  } catch {
    // A blocked store means the introduction shows again, which is a small
    // annoyance and the right way to fail.
    return false
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, 'yes')
  } catch {
    // See above.
  }
}
