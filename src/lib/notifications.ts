import type { PullRequest } from '../types'
import type { MessageKey } from '../i18n/en'
import { applyStages } from './filter'

/**
 * Notifications, within what a page with no backend can honestly do.
 *
 * There is no push here. Web Push needs a server holding VAPID keys to send
 * through a push service, and this app has no server — so these fire from the
 * open tab, while it is open. That is a real limitation and the UI says so
 * rather than implying a phone will buzz.
 */

export interface NotifyRule {
  id: string
  label: MessageKey
  /** Wording for the notification body; the PR title follows. */
  headline: MessageKey
  query: string
}

export const NOTIFY_RULES: NotifyRule[] = [
  {
    id: 'review-requested',
    label: 'notifyRule.reviewRequested',
    headline: 'notifyHeadline.reviewRequested',
    query: 'is:open review-requested:@me',
  },
  {
    id: 'approved',
    label: 'notifyRule.approved',
    headline: 'notifyHeadline.approved',
    query: 'is:open author:@me review:approved',
  },
  {
    id: 'changes-requested',
    label: 'notifyRule.changesRequested',
    headline: 'notifyHeadline.changesRequested',
    query: 'is:open author:@me review:changes-requested',
  },
  {
    id: 'ci-failed',
    label: 'notifyRule.ciFailed',
    headline: 'notifyHeadline.ciFailed',
    query: 'is:open author:@me checks:failure',
  },
]

export const DEFAULT_NOTIFY_ENABLED: Record<string, boolean> = Object.fromEntries(
  NOTIFY_RULES.map((rule) => [rule.id, true]),
)

/**
 * A pull request's identity for notification purposes is repo and number, not
 * head SHA: a new commit should be able to *change* whether a rule matches
 * (green CI turning red) without the PR reading as brand new every push.
 */
export function prKey(pr: PullRequest): string {
  return `${pr.repo}#${pr.number}`
}

export interface NotifyState {
  /** PRs whose review and check state have been observed at least once. */
  seen: string[]
  /** Per rule, the PRs that matched at the previous evaluation. */
  matched: Record<string, string[]>
}

export const EMPTY_NOTIFY_STATE: NotifyState = { seen: [], matched: {} }

/**
 * Review and check state arrive in a second pass, so a PR briefly reads as
 * UNKNOWN. Evaluating those would turn every first load into a burst of
 * notifications for things that did not just happen.
 */
function isSettled(pr: PullRequest): boolean {
  return pr.reviewDecision !== 'UNKNOWN' && pr.checkState !== 'UNKNOWN'
}

export interface Firing {
  rule: NotifyRule
  pr: PullRequest
}

/**
 * Work out what to announce, and what the new baseline is.
 *
 * A rule fires for a pull request only when that PR was already known *and* did
 * not match before. So the first evaluation announces nothing however many PRs
 * match — it establishes the baseline — and a PR that appears later is baselined
 * on the poll that first sees it settled. Only a genuine transition notifies.
 */
export function evaluate(
  prs: PullRequest[],
  enabled: Record<string, boolean>,
  state: NotifyState,
  options: { viewer: string; now?: number },
): { fires: Firing[]; next: NotifyState } {
  const settled = prs.filter(isSettled)
  const seen = new Set(state.seen)
  const fires: Firing[] = []
  const matched: Record<string, string[]> = {}

  for (const rule of NOTIFY_RULES) {
    const matching = applyStages(settled, [rule.query], options)
    const before = new Set(state.matched[rule.id] ?? [])
    matched[rule.id] = matching.map(prKey)

    if (!enabled[rule.id]) continue
    for (const pr of matching) {
      const key = prKey(pr)
      if (seen.has(key) && !before.has(key)) fires.push({ rule, pr })
    }
  }

  // The baseline holds only what is currently in the list, so it stays bounded
  // rather than growing for the life of the browser profile.
  return { fires, next: { seen: settled.map(prKey), matched } }
}

/** How many pull requests are waiting on this user, for the tab title. */
export function waitingCount(
  prs: PullRequest[],
  options: { viewer: string; now?: number },
): number {
  return applyStages(prs, ['is:open review-requested:@me'], options).length
}
