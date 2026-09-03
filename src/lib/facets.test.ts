import { describe, expect, it } from 'vitest'
import { DEFAULT_SELECTION, FACETS, combine, facetCounts, selectionQuery } from './facets'
import type { PullRequest } from '../types'

const NOW = Date.parse('2026-09-03T12:00:00Z')
const day = 86_400_000

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: Math.random().toString(36),
    number: 1,
    title: 'A change',
    url: 'https://github.com/acme/web/pull/1',
    repo: 'acme/web',
    headSha: 'abc',
    isDraft: false,
    createdAt: new Date(NOW - day).toISOString(),
    updatedAt: new Date(NOW - day).toISOString(),
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

const facet = (id: string) => FACETS.find((f) => f.id === id)!

describe('the default selection', () => {
  it('filters nothing, so the first view is everything', () => {
    expect(selectionQuery(DEFAULT_SELECTION, '')).toBe('')
  })

  it('shows drafts, because a draft is a state worth seeing here', () => {
    const drafts = facet('draft')
    expect(drafts.options[0].id).toBe(DEFAULT_SELECTION.draft)
    expect(drafts.options[0].query).toBe('')
  })
})

describe('combine', () => {
  it('joins only the non-empty parts', () => {
    expect(combine('author:@me', '', '  ', 'is:draft')).toBe('author:@me is:draft')
  })
})

describe('selectionQuery', () => {
  it('ANDs the axes together with the typed text', () => {
    const query = selectionQuery(
      { involvement: 'mine', state: 'changes', draft: 'hide' },
      'label:bug',
    )
    expect(query).toBe('author:@me review:changes-requested -is:draft label:bug')
  })
})

/**
 * The axes are ANDed by concatenating their query strings, and the filter
 * language ORs repeated positive terms of the same qualifier — GitHub does the
 * same, and matching it is a stated goal. That combination is only sound while
 * no two axes use the same qualifier, so this is a real invariant rather than a
 * tidiness check: an axis added later that reuses, say, `author:` would silently
 * widen results instead of narrowing them.
 */
describe('the axes never share a qualifier', () => {
  const keysOf = (facet: (typeof FACETS)[number]) =>
    new Set(
      facet.options
        .flatMap((option) => option.query.split(/\s+/))
        .filter(Boolean)
        .map((term) => term.replace(/^-/, '').split(':')[0]),
    )

  it('uses a disjoint set of qualifiers per axis', () => {
    const perAxis = FACETS.map((facet) => ({ id: facet.id, keys: keysOf(facet) }))
    expect(perAxis.every((axis) => axis.keys.size > 0)).toBe(true)

    const collisions: string[] = []
    for (let i = 0; i < perAxis.length; i++) {
      for (let j = i + 1; j < perAxis.length; j++) {
        for (const key of perAxis[i].keys) {
          if (perAxis[j].keys.has(key)) {
            collisions.push(`${perAxis[i].id}/${perAxis[j].id}: ${key}`)
          }
        }
      }
    }
    expect(collisions).toEqual([])
  })
})

describe('facetCounts', () => {
  const prs = [
    pr({ author: { login: 'arye', avatarUrl: '' }, reviewDecision: 'APPROVED' }),
    pr({ author: { login: 'arye', avatarUrl: '' }, reviewDecision: 'CHANGES_REQUESTED' }),
    pr({ author: { login: 'arye', avatarUrl: '' }, reviewDecision: 'APPROVED', isDraft: true }),
    pr({ author: { login: 'bob', avatarUrl: '' }, reviewDecision: 'APPROVED' }),
  ]
  const count = (id: string, selection = DEFAULT_SELECTION, text = '') =>
    facetCounts(prs, facet(id), selection, text, 'arye', NOW)

  it('counts each option against the whole list by default', () => {
    expect(count('state').approved).toBe(3)
    expect(count('involvement').mine).toBe(3)
  })

  it('narrows an axis by the other axes, which is what makes the number useful', () => {
    const mine = { ...DEFAULT_SELECTION, involvement: 'mine' }
    expect(count('state', mine).approved).toBe(2)
    expect(count('state', mine).changes).toBe(1)
  })

  it('narrows by the draft axis too', () => {
    const noDrafts = { ...DEFAULT_SELECTION, draft: 'hide' }
    expect(count('state', noDrafts).approved).toBe(2)
    const onlyDrafts = { ...DEFAULT_SELECTION, draft: 'only' }
    expect(count('state', onlyDrafts).approved).toBe(1)
  })

  it('counts an axis without applying its own current selection', () => {
    // With Approved selected, the Changes-requested count must still report
    // what switching to it would show, not zero.
    const approved = { ...DEFAULT_SELECTION, state: 'approved' }
    expect(count('state', approved).changes).toBe(1)
  })

  it('respects typed text on a different qualifier', () => {
    expect(count('involvement', DEFAULT_SELECTION, 'label:bug').mine).toBe(0)
    expect(count('involvement', DEFAULT_SELECTION, 'repo:acme/web').mine).toBe(3)
  })

  it('does not count a PR whose review state has not been fetched as awaiting', () => {
    const unknown = [pr({ reviewDecision: 'UNKNOWN' })]
    const counts = facetCounts(unknown, facet('state'), DEFAULT_SELECTION, '', 'arye', NOW)
    expect(counts.awaiting).toBe(0)
    expect(counts.any).toBe(1)
  })
})
