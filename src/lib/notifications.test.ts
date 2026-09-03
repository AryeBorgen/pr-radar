import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFY_ENABLED,
  EMPTY_NOTIFY_STATE,
  evaluate,
  prKey,
  waitingCount,
} from './notifications'
import type { PullRequest } from '../types'

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: Math.random().toString(36),
    number: 1,
    title: 'A change',
    url: 'u',
    repo: 'acme/web',
    state: 'OPEN',
    mergedAt: null,
    closedAt: null,
    headSha: 'abc',
    isDraft: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: { login: 'bob', avatarUrl: '' },
    labels: [],
    assignees: [],
    requestedReviewers: [],
    reviewedBy: [],
    reviewDecision: 'NONE',
    checkState: 'NONE',
    ...overrides,
  }
}

const run = (prs: PullRequest[], state = EMPTY_NOTIFY_STATE) =>
  evaluate(prs, DEFAULT_NOTIFY_ENABLED, state, { viewer: 'arye' })

const ids = (fires: ReturnType<typeof run>['fires']) => fires.map((f) => `${f.rule.id}:${f.pr.number}`)

describe('the first evaluation', () => {
  it('announces nothing, however much already matches', () => {
    const waiting = pr({ number: 1, requestedReviewers: ['arye'] })
    const approved = pr({ number: 2, author: { login: 'arye', avatarUrl: '' }, reviewDecision: 'APPROVED' })
    const { fires, next } = run([waiting, approved])

    expect(fires).toEqual([])
    expect(next.seen).toEqual(['acme/web#1', 'acme/web#2'])
    expect(next.matched['review-requested']).toEqual(['acme/web#1'])
  })
})

describe('transitions', () => {
  it('fires when a known PR starts matching', () => {
    const before = pr({ number: 1 })
    const first = run([before])
    const after = pr({ number: 1, requestedReviewers: ['arye'] })

    expect(ids(run([after], first.next).fires)).toEqual(['review-requested:1'])
  })

  it('does not fire again while it keeps matching', () => {
    const waiting = pr({ number: 1, requestedReviewers: ['arye'] })
    const first = run([pr({ number: 1 })])
    const second = run([waiting], first.next)
    expect(ids(second.fires)).toEqual(['review-requested:1'])
    expect(ids(run([waiting], second.next).fires)).toEqual([])
  })

  it('fires again if it stops matching and then matches once more', () => {
    const plain = pr({ number: 1 })
    const waiting = pr({ number: 1, requestedReviewers: ['arye'] })
    const a = run([plain])
    const b = run([waiting], a.next)
    const c = run([plain], b.next)
    expect(ids(run([waiting], c.next).fires)).toEqual(['review-requested:1'])
  })

  it('announces a PR that was already known before it changed, not one just discovered', () => {
    const known = run([pr({ number: 1 })])
    const brandNew = pr({ number: 9, requestedReviewers: ['arye'] })
    // Number 9 appears for the first time already matching: baseline, no noise.
    expect(ids(run([pr({ number: 1 }), brandNew], known.next).fires)).toEqual([])
  })
})

/*
 * Review and check state arrive in a second pass. Without this guard every
 * first load would fire once per PR as UNKNOWN resolved into a real state.
 */
describe('pull requests whose state has not been fetched', () => {
  it('are ignored entirely, and baselined only once settled', () => {
    const mine = { login: 'arye', avatarUrl: '' }
    const loading = pr({ number: 1, author: mine, reviewDecision: 'UNKNOWN', checkState: 'UNKNOWN' })
    const first = run([loading])
    expect(first.fires).toEqual([])
    expect(first.next.seen).toEqual([])

    const settled = pr({ number: 1, author: mine, reviewDecision: 'APPROVED', checkState: 'SUCCESS' })
    const second = run([settled], first.next)
    expect(second.fires).toEqual([])
    expect(second.next.seen).toEqual(['acme/web#1'])
  })
})

describe('a rule that is switched off', () => {
  it('still tracks state, so turning it on does not replay history', () => {
    const off = { ...DEFAULT_NOTIFY_ENABLED, 'review-requested': false }
    const waiting = pr({ number: 1, requestedReviewers: ['arye'] })
    const first = evaluate([pr({ number: 1 })], off, EMPTY_NOTIFY_STATE, { viewer: 'arye' })
    const second = evaluate([waiting], off, first.next, { viewer: 'arye' })
    expect(second.fires).toEqual([])

    const third = evaluate([waiting], DEFAULT_NOTIFY_ENABLED, second.next, { viewer: 'arye' })
    expect(third.fires).toEqual([])
  })
})

describe('the baseline', () => {
  it('drops pull requests that are no longer in the list, so it stays bounded', () => {
    const first = run([pr({ number: 1 }), pr({ number: 2 })])
    expect(first.next.seen).toHaveLength(2)
    expect(run([pr({ number: 1 })], first.next).next.seen).toEqual(['acme/web#1'])
  })
})

describe('identity', () => {
  it('is repo and number, so a new commit changes state instead of the PR', () => {
    expect(prKey(pr({ number: 7, headSha: 'aaa' }))).toBe(prKey(pr({ number: 7, headSha: 'bbb' })))
  })

  it('fires on CI turning red after a push, because the PR was already known', () => {
    const mine = { login: 'arye', avatarUrl: '' }
    const green = pr({ number: 5, author: mine, headSha: 'aaa', checkState: 'SUCCESS' })
    const red = pr({ number: 5, author: mine, headSha: 'bbb', checkState: 'FAILURE' })
    expect(ids(run([red], run([green]).next).fires)).toEqual(['ci-failed:5'])
  })
})

describe('waitingCount', () => {
  it('counts only open pull requests awaiting this reviewer', () => {
    const list = [
      pr({ number: 1, requestedReviewers: ['arye'] }),
      pr({ number: 2, requestedReviewers: ['bob'] }),
      pr({ number: 3, state: 'MERGED', requestedReviewers: ['arye'] }),
    ]
    expect(waitingCount(list, { viewer: 'arye' })).toBe(1)
  })
})
