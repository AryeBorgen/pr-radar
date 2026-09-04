import type { PullRequest } from '../types'
import type { MessageKey } from '../i18n/en'

/**
 * What may be done to a pull request, and when. Pure; the I/O is elsewhere.
 *
 * This is the first thing in the application that *writes*. Everything until
 * now could be wrong and cost a refresh; a merge cannot be taken back from
 * here. So the rules about when an action is offered, and what has to happen
 * before it runs, live in one tested place rather than being spread across a
 * component's conditionals.
 */

export type ActionKind = 'merge' | 'close' | 'reopen'

/** The three ways GitHub can merge, in the order its own menu lists them. */
export const MERGE_METHODS = ['merge', 'squash', 'rebase'] as const
export type MergeMethod = (typeof MERGE_METHODS)[number]

/**
 * What the single-PR endpoint says about whether a merge would work.
 *
 * The list endpoint does not carry it -- see the note in CLAUDE.md about what
 * REST's list omits -- so this is fetched for one pull request at the moment
 * somebody opens its menu, and never for a whole page of them. A dashboard that
 * polls fifteen repositories cannot afford a request per row for a question
 * nobody has asked yet.
 */
export interface Mergeability {
  /** null means GitHub is still computing it, which is a real state. */
  mergeable: boolean | null
  /** `clean`, `blocked`, `behind`, `dirty`, `draft`, `unknown`… */
  state: string
  /** Merge methods the repository allows. Empty until known. */
  allowed: MergeMethod[]
}

export type Availability =
  | { can: true }
  | { can: false; why: MessageKey }

/**
 * Whether a merge can be attempted, and if not, why in words.
 *
 * `undefined` mergeability is not `false`. It means the question has not been
 * asked yet -- the same distinction the review and check rollups make between
 * UNKNOWN and NONE, and for the same reason: a button disabled because nothing
 * is known yet is a button that looks broken.
 */
export function canMerge(pr: PullRequest, info: Mergeability | undefined): Availability {
  if (pr.state !== 'OPEN') return { can: false, why: 'action.notOpen' }
  if (pr.isDraft) return { can: false, why: 'action.isDraft' }
  if (info === undefined) return { can: true }

  // GitHub computes mergeability asynchronously and answers `null` while it
  // works. Refusing then would be wrong; it is a "not yet", not a "no".
  if (info.mergeable === null) return { can: false, why: 'action.mergeabilityUnknown' }
  if (info.mergeable === false) {
    // `blocked` is the interesting one: the branch is fine, a required review
    // or check is not. Saying "conflicts" there would send someone to rebase a
    // branch that has nothing wrong with it.
    if (info.state === 'dirty') return { can: false, why: 'action.hasConflicts' }
    if (info.state === 'blocked') return { can: false, why: 'action.blocked' }
    if (info.state === 'behind') return { can: false, why: 'action.behind' }
    return { can: false, why: 'action.notMergeable' }
  }
  return { can: true }
}

export function canClose(pr: PullRequest): Availability {
  if (pr.state !== 'OPEN') return { can: false, why: 'action.notOpen' }
  return { can: true }
}

/**
 * Which merge methods to offer.
 *
 * Before the repository has answered, all three: showing none would look like a
 * repository that cannot be merged at all. Afterwards, exactly what it allows --
 * offering `rebase` to a repository with rebase merging switched off produces a
 * 405 from GitHub and looks like a bug in this app.
 */
export function methodsFor(info: Mergeability | undefined): MergeMethod[] {
  if (info === undefined || info.allowed.length === 0) return [...MERGE_METHODS]
  return MERGE_METHODS.filter((method) => info.allowed.includes(method))
}

/**
 * Does this action need confirming before it runs?
 *
 * Merging is not undoable from here and lands code on a branch other people
 * build on. Closing is: GitHub reopens a pull request with one click, and this
 * offers `reopen` for exactly that. Reopening undoes something rather than doing
 * it, so it asks nothing.
 *
 * Every destructive action asks. The alternative -- a single click that merges
 * -- is the kind of feature that gets a dashboard uninstalled the first time
 * somebody's cursor is one row off.
 */
export function needsConfirmation(kind: ActionKind): boolean {
  return kind !== 'reopen'
}

/**
 * The state a pull request should be shown in immediately after an action,
 * before GitHub has been asked again.
 *
 * Optimistic, and reverted if the request fails. A list that does not move
 * until the next poll makes a person click twice, and clicking merge twice is
 * exactly the thing this file exists to prevent.
 */
export function optimistic(pr: PullRequest, kind: ActionKind, now: number): PullRequest {
  const at = new Date(now).toISOString()
  switch (kind) {
    case 'merge':
      return { ...pr, state: 'MERGED', mergedAt: at, closedAt: at, updatedAt: at }
    case 'close':
      return { ...pr, state: 'CLOSED', mergedAt: null, closedAt: at, updatedAt: at }
    case 'reopen':
      return { ...pr, state: 'OPEN', mergedAt: null, closedAt: null, updatedAt: at }
  }
}

/**
 * Turn a failed write into something the reader can act on.
 *
 * GitHub's status codes here are unusually specific, and flattening them into
 * "something went wrong" throws away the only useful part: 409 means somebody
 * pushed while the menu was open, which is a different problem from 403, which
 * means this token was never going to be allowed.
 */
export function failureFor(status: number | undefined): MessageKey {
  switch (status) {
    case 401:
      return 'error.tokenRejected'
    case 403:
      return 'action.failed.forbidden'
    case 404:
      // 404 on a write usually means the token cannot see the repository at
      // all, which GitHub reports as absence rather than as refusal.
      return 'action.failed.notFound'
    case 405:
      return 'action.failed.notMergeable'
    case 409:
      return 'action.failed.changed'
    case 422:
      return 'action.failed.rejected'
    default:
      return 'action.failed.unknown'
  }
}

/**
 * How a pull request is named to a reader: `acme/web #7`.
 *
 * One function, because it is interpolated into several sentences and has to be
 * one run for the bidirectional algorithm to keep it together. Built as two
 * values -- repository and number -- the `#` sat outside the isolate, took the
 * surrounding paragraph's direction, and rendered `#1` as `1#` in Hebrew.
 */
export function reference(pr: { repo: string; number: number }): string {
  return `${pr.repo} #${pr.number}`
}
