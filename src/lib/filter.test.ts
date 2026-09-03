import { describe, expect, it } from 'vitest'
import { applyQuery, parseQuery, tokenize } from './filter'
import type { PullRequest } from '../types'

const NOW = Date.parse('2026-09-03T12:00:00Z')
const day = 86_400_000

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: overrides.id ?? Math.random().toString(36),
    number: 1,
    title: 'Add a thing',
    url: 'https://github.com/acme/web/pull/1',
    repo: 'acme/web',
    state: 'OPEN',
    mergedAt: null,
    isDraft: false,
    createdAt: new Date(NOW - day).toISOString(),
    updatedAt: new Date(NOW - day).toISOString(),
    headSha: 'abc123',
    author: { login: 'alice', avatarUrl: '' },
    labels: [],
    assignees: [],
    requestedReviewers: [],
    reviewedBy: [],
    reviewDecision: 'NONE',
    checkState: 'NONE',
    ...overrides,
  }
}

const run = (prs: PullRequest[], query: string) => applyQuery(prs, query, { viewer: 'alice', now: NOW })

describe('tokenize', () => {
  it('keeps quoted values together', () => {
    expect(tokenize('label:"needs design" author:bob')).toEqual([
      'label:needs design',
      'author:bob',
    ])
  })

  it('collapses repeated whitespace', () => {
    expect(tokenize('  a   b  ')).toEqual(['a', 'b'])
  })
})

describe('parseQuery', () => {
  it('reports qualifiers it does not implement', () => {
    expect(parseQuery('author:bob milestone:v2 sort:nonsense').unknown).toEqual([
      'milestone:v2',
      'sort:nonsense',
    ])
  })

  it('requires a comparison operator on date qualifiers', () => {
    expect(parseQuery('updated:7d').unknown).toEqual(['updated:7d'])
    expect(parseQuery('updated:<7d').terms).toEqual([
      { key: 'updated', op: '<', value: '7d', negated: false },
    ])
  })

  it('treats bare words as text and defaults the sort', () => {
    const parsed = parseQuery('flaky test')
    expect(parsed.text).toEqual(['flaky', 'test'])
    expect(parsed.sort).toBe('updated-desc')
  })
})

describe('applyQuery', () => {
  it('resolves @me to the viewer', () => {
    const mine = pr({ author: { login: 'alice', avatarUrl: '' } })
    const theirs = pr({ author: { login: 'bob', avatarUrl: '' } })
    expect(run([mine, theirs], 'author:@me')).toEqual([mine])
  })

  it('ORs repeated non-label qualifiers', () => {
    const a = pr({ author: { login: 'alice', avatarUrl: '' } })
    const b = pr({ author: { login: 'bob', avatarUrl: '' } })
    const c = pr({ author: { login: 'carol', avatarUrl: '' } })
    expect(run([a, b, c], 'author:alice author:bob')).toHaveLength(2)
  })

  it('ANDs repeated label qualifiers', () => {
    const both = pr({
      labels: [
        { name: 'bug', color: 'ff0000' },
        { name: 'p1', color: '00ff00' },
      ],
    })
    const one = pr({ labels: [{ name: 'bug', color: 'ff0000' }] })
    expect(run([both, one], 'label:bug label:p1')).toEqual([both])
  })

  it('excludes on negation', () => {
    const draft = pr({ isDraft: true })
    const ready = pr({ isDraft: false })
    expect(run([draft, ready], '-is:draft')).toEqual([ready])
  })

  it('matches labels case-insensitively and through quotes', () => {
    const target = pr({ labels: [{ name: 'Needs Design', color: 'ffffff' }] })
    expect(run([target], 'label:"needs design"')).toEqual([target])
  })

  it('reads updated:<7d as older than seven days', () => {
    const fresh = pr({ updatedAt: new Date(NOW - 2 * day).toISOString() })
    const stale = pr({ updatedAt: new Date(NOW - 20 * day).toISOString() })
    expect(run([fresh, stale], 'updated:<7d')).toEqual([stale])
  })

  it('never matches a closed state, since only open PRs are fetched', () => {
    expect(run([pr()], 'is:merged')).toEqual([])
  })

  it('filters on review decision and check state', () => {
    const blocked = pr({ reviewDecision: 'CHANGES_REQUESTED', checkState: 'FAILURE' })
    const clean = pr({ reviewDecision: 'APPROVED', checkState: 'SUCCESS' })
    expect(run([blocked, clean], 'review:changes-requested')).toEqual([blocked])
    expect(run([blocked, clean], 'checks:failure')).toEqual([blocked])
    expect(run([blocked, clean], 'review:approved checks:success')).toEqual([clean])
  })

  it('supports no: for empty collections', () => {
    const bare = pr()
    const tagged = pr({ labels: [{ name: 'bug', color: 'ff0000' }] })
    expect(run([bare, tagged], 'no:label')).toEqual([bare])
  })

  it('matches free text against title, repo and number', () => {
    const target = pr({ title: 'Fix the flaky login test', number: 42, repo: 'acme/api' })
    const other = pr({ title: 'Bump deps' })
    expect(run([target, other], 'flaky')).toEqual([target])
    expect(run([target, other], 'acme/api')).toEqual([target])
    expect(run([target, other], '#42')).toEqual([target])
  })

  it('sorts by the requested key', () => {
    const old = pr({ id: 'old', updatedAt: new Date(NOW - 10 * day).toISOString() })
    const recent = pr({ id: 'recent', updatedAt: new Date(NOW - day).toISOString() })
    expect(run([old, recent], '').map((p) => p.id)).toEqual(['recent', 'old'])
    expect(run([old, recent], 'sort:updated-asc').map((p) => p.id)).toEqual(['old', 'recent'])
  })

  it('distinguishes a status not yet loaded from a status of none', () => {
    const loaded = pr({ id: 'loaded', reviewDecision: 'NONE', checkState: 'NONE' })
    const loading = pr({ id: 'loading', reviewDecision: 'UNKNOWN', checkState: 'UNKNOWN' })
    expect(run([loaded, loading], 'review:none').map((p) => p.id)).toEqual(['loaded'])
    expect(run([loaded, loading], 'review:unknown').map((p) => p.id)).toEqual(['loading'])
    expect(run([loaded, loading], 'checks:none').map((p) => p.id)).toEqual(['loaded'])
    expect(run([loaded, loading], 'checks:unknown').map((p) => p.id)).toEqual(['loading'])
  })

  it('maps review:required onto the REVIEW_REQUIRED state', () => {
    const waiting = pr({ reviewDecision: 'REVIEW_REQUIRED' })
    const approved = pr({ reviewDecision: 'APPROVED' })
    expect(run([waiting, approved], 'review:required')).toEqual([waiting])
  })

  it('matches involves: against author, assignee, requested reviewer and reviewer', () => {
    const author = pr({ id: 'author', author: { login: 'alice', avatarUrl: '' } })
    const assigned = pr({
      id: 'assigned',
      author: { login: 'bob', avatarUrl: '' },
      assignees: [{ login: 'alice', avatarUrl: '' }],
    })
    const requested = pr({
      id: 'requested',
      author: { login: 'bob', avatarUrl: '' },
      requestedReviewers: ['alice'],
    })
    const reviewed = pr({
      id: 'reviewed',
      author: { login: 'bob', avatarUrl: '' },
      reviewedBy: ['alice'],
    })
    const unrelated = pr({ id: 'unrelated', author: { login: 'bob', avatarUrl: '' } })
    expect(run([author, assigned, requested, reviewed, unrelated], 'involves:@me').map((p) => p.id))
      .toEqual(['author', 'assigned', 'requested', 'reviewed'])
  })

  it('returns everything for an empty query', () => {
    expect(run([pr(), pr()], '')).toHaveLength(2)
  })

  it('ignores an unknown qualifier rather than dropping every result', () => {
    expect(run([pr()], 'milestone:v2')).toHaveLength(1)
  })
})
