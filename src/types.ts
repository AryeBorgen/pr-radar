/** A repository the user has asked to watch, as `owner/name`. */
export interface RepoRef {
  owner: string
  name: string
}

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

/** GitHub's statusCheckRollup, flattened to the four states we render. */
export type CheckState = 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NONE'

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
 * One pull request, normalised out of the GraphQL response. Everything the UI
 * and the filter language read lives here — nothing reaches into raw API shapes.
 */
export interface PullRequest {
  id: string
  number: number
  title: string
  url: string
  repo: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  author: Actor | null
  labels: Label[]
  assignees: Actor[]
  /** Users and teams with a review still outstanding. Teams appear as their name. */
  requestedReviewers: string[]
  /** Logins that have already submitted any review. */
  reviewedBy: string[]
  reviewDecision: ReviewDecision
  checkState: CheckState
  comments: number
  additions: number
  deletions: number
  changedFiles: number
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
}

/** A named saved filter. Buckets are nothing but a query string with a label. */
export interface Bucket {
  id: string
  name: string
  query: string
}

export interface Settings {
  repos: RepoRef[]
  buckets: Bucket[]
  /** Seconds between background refetches. 0 disables polling. */
  refreshInterval: number
}
