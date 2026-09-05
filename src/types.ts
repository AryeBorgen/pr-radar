/** A repository the user has asked to watch, as `owner/name`. */
export type { RepoRef } from './public'
import type { RepoRef } from './public'

/**
 * Review and check state both carry an `UNKNOWN` member, and that is load-bearing
 * rather than defensive. The REST list endpoint does not report either one, so
 * they arrive in a second pass per pull request. `UNKNOWN` means "not answered
 * yet" and is deliberately distinct from `NONE` ("answered: there are none"), so
 * a filter is never silently wrong about a PR whose status has not arrived.
 */
export type ReviewDecision =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUIRED'
  | 'NONE'
  | 'UNKNOWN'

export type CheckState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NONE' | 'UNKNOWN'

export interface Actor {
  login: string
  avatarUrl: string
}

export interface Label {
  name: string
  /** Six hex digits, no leading `#`, exactly as GitHub returns it. */
  color: string
}

/**
 * One pull request, normalised out of the REST response. Everything the UI and
 * the filter language read lives here — nothing reaches into raw API shapes,
 * which is what kept the move off GraphQL confined to one module.
 */
export type PullState = 'OPEN' | 'MERGED' | 'CLOSED'

export interface PullRequest {
  id: string
  number: number
  title: string
  url: string
  repo: string
  state: PullState
  /** Set only when merged; the sort key for browsing merge history. */
  mergedAt: string | null
  /**
   * When the PR left the open state, merged or not. This is the date a period
   * filter has to use: GitHub can only sort closed PRs by `updated`, so a PR
   * merged months ago but touched yesterday comes back near the top and would
   * pass an update-based cutoff while having nothing to do with the period.
   */
  closedAt: string | null
  /** Head commit SHA: identifies what the review and check state belong to. */
  headSha: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  author: Actor | null
  labels: Label[]
  assignees: Actor[]
  /** Users and teams with a review still outstanding. Teams appear as their name. */
  requestedReviewers: string[]
  /** Logins that have already submitted a review. Empty until enriched. */
  reviewedBy: string[]
  reviewDecision: ReviewDecision
  checkState: CheckState
}

/** The per-PR state fetched in the second pass. */
export interface Enrichment {
  reviewedBy: string[]
  reviewDecision: ReviewDecision
  checkState: CheckState
}

/** A named saved filter. A view is nothing but a query string with a label. */
export interface SavedView {
  id: string
  name: string
  query: string
}

export interface Settings {
  repos: RepoRef[]
  views: SavedView[]
  /** Seconds between background refetches. 0 disables polling. */
  refreshInterval: number
}
