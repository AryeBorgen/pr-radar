import { describe, expect, it } from 'vitest'
import {
  canClose,
  canMerge,
  failureFor,
  MERGE_METHODS,
  methodsFor,
  needsConfirmation,
  optimistic,
  type Mergeability,
} from './actions'
import type { PullRequest } from '../types'

const NOW = Date.parse('2026-09-04T12:00:00Z')

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  id: '1', number: 7, title: 'A change', url: 'https://github.com/acme/web/pull/7',
  repo: 'acme/web', state: 'OPEN', mergedAt: null, closedAt: null, headSha: 'abc',
  isDraft: false, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  author: { login: 'octocat', avatarUrl: '' }, labels: [], assignees: [],
  requestedReviewers: [], reviewedBy: [], reviewDecision: 'NONE', checkState: 'NONE',
  ...over,
})

const info = (over: Partial<Mergeability> = {}): Mergeability => ({
  mergeable: true, state: 'clean', allowed: [...MERGE_METHODS], ...over,
})

describe('whether a merge can be attempted', () => {
  it('allows a clean open pull request', () => {
    expect(canMerge(pr(), info())).toEqual({ can: true })
  })

  it.each(['MERGED', 'CLOSED'] as const)('refuses one that is already %s', (state) => {
    expect(canMerge(pr({ state }), info())).toEqual({ can: false, why: 'action.notOpen' })
  })

  it('refuses a draft, and says where to change that', () => {
    expect(canMerge(pr({ isDraft: true }), info())).toEqual({ can: false, why: 'action.isDraft' })
  })

  /*
   * The distinction this whole file is shaped around. `undefined` means nobody
   * has asked GitHub yet -- the menu is not open -- and refusing then would
   * show a disabled button with no explanation on every row. `null` means
   * GitHub was asked and is still computing, which is a real, temporary no.
   *
   * The same UNKNOWN-is-not-NONE rule as the review and check rollups.
   */
  it('allows it before the question has been asked', () => {
    expect(canMerge(pr(), undefined)).toEqual({ can: true })
  })

  it('refuses while GitHub is still computing, which is different', () => {
    expect(canMerge(pr(), info({ mergeable: null }))).toEqual({
      can: false,
      why: 'action.mergeabilityUnknown',
    })
  })

  // Each of these sends a person somewhere different. Flattening them into
  // "cannot merge" would send someone to rebase a branch that is fine.
  it.each([
    ['dirty', 'action.hasConflicts'],
    ['blocked', 'action.blocked'],
    ['behind', 'action.behind'],
    ['something_new', 'action.notMergeable'],
  ] as const)('explains %s as %s', (state, why) => {
    expect(canMerge(pr(), info({ mergeable: false, state }))).toEqual({ can: false, why })
  })
})

describe('whether it can be closed', () => {
  it('allows an open one', () => {
    expect(canClose(pr())).toEqual({ can: true })
  })

  it('refuses one already closed', () => {
    expect(canClose(pr({ state: 'CLOSED' }))).toEqual({ can: false, why: 'action.notOpen' })
  })

  // A draft is a perfectly ordinary thing to close. Only merging cares.
  it('allows a draft', () => {
    expect(canClose(pr({ isDraft: true }))).toEqual({ can: true })
  })
})

describe('which merge methods to offer', () => {
  it('offers all three before the repository has answered', () => {
    expect(methodsFor(undefined)).toEqual([...MERGE_METHODS])
  })

  // Offering rebase to a repository with rebase merging switched off produces a
  // 405 from GitHub and looks like a bug in this app.
  it('offers only what the repository allows', () => {
    expect(methodsFor(info({ allowed: ['squash'] }))).toEqual(['squash'])
  })

  it('keeps GitHub\'s own order rather than the repository\'s', () => {
    expect(methodsFor(info({ allowed: ['rebase', 'merge'] }))).toEqual(['merge', 'rebase'])
  })

  // Showing none would read as a repository that cannot be merged at all.
  it('falls back to all three rather than showing none', () => {
    expect(methodsFor(info({ allowed: [] }))).toEqual([...MERGE_METHODS])
  })
})

describe('confirmation', () => {
  // A single click that merges is the kind of feature that gets a dashboard
  // uninstalled the first time somebody's cursor is one row off.
  it('is required before anything destructive', () => {
    expect(needsConfirmation('merge')).toBe(true)
    expect(needsConfirmation('close')).toBe(true)
  })

  // Reopening undoes something rather than doing it.
  it('is not required to reopen', () => {
    expect(needsConfirmation('reopen')).toBe(false)
  })
})

describe('how the row looks straight after an action', () => {
  it('shows a merge as merged, and closed, at the same moment', () => {
    const after = optimistic(pr(), 'merge', NOW)
    expect(after.state).toBe('MERGED')
    expect(after.mergedAt).toBe(new Date(NOW).toISOString())
    expect(after.closedAt).toBe(new Date(NOW).toISOString())
  })

  // A closed pull request is not a merged one, and the merge-history view keys
  // on mergedAt. Setting it here would put a closed PR in the merge list.
  it('shows a close as closed and not merged', () => {
    const after = optimistic(pr(), 'close', NOW)
    expect(after.state).toBe('CLOSED')
    expect(after.mergedAt).toBeNull()
    expect(after.closedAt).not.toBeNull()
  })

  it('clears both dates on a reopen', () => {
    const after = optimistic(pr({ state: 'CLOSED', closedAt: '2026-09-02T00:00:00Z' }), 'reopen', NOW)
    expect(after).toMatchObject({ state: 'OPEN', closedAt: null, mergedAt: null })
  })

  it('changes nothing else about the pull request', () => {
    const before = pr()
    const after = optimistic(before, 'close', NOW)
    expect({ ...after, state: before.state, closedAt: before.closedAt, updatedAt: before.updatedAt })
      .toEqual(before)
  })
})

describe('explaining a failure', () => {
  // These mean genuinely different things, and "something went wrong" throws
  // away the only part worth reading. 409 means someone pushed while the menu
  // was open; 403 means this token was never going to be allowed.
  it.each([
    [401, 'error.tokenRejected'],
    [403, 'action.failed.forbidden'],
    [404, 'action.failed.notFound'],
    [405, 'action.failed.notMergeable'],
    [409, 'action.failed.changed'],
    [422, 'action.failed.rejected'],
  ] as const)('%i is %s', (status, key) => {
    expect(failureFor(status)).toBe(key)
  })

  it('admits it does not know, rather than guessing', () => {
    expect(failureFor(500)).toBe('action.failed.unknown')
    expect(failureFor(undefined)).toBe('action.failed.unknown')
  })
})
