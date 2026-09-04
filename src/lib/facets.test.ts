import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SELECTION,
  FACETS,
  combine,
  facetCounts,
  needsClosed,
  selectionQuery,
  selectionStages,
} from './facets'
import type { Selection } from './facets'
import { applyStages } from './filter'
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
    state: 'OPEN',
    mergedAt: null,
    closedAt: null,
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
  it('opens on open pull requests', () => {
    expect(selectionQuery(DEFAULT_SELECTION, '')).toBe('is:open')
  })

  it('shows drafts, because a draft is a state worth seeing here', () => {
    const drafts = facet('draft')
    expect(drafts.options[0]?.id).toBe(DEFAULT_SELECTION.draft)
    expect(drafts.options[0]?.query).toBe('')
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
 * The axes must intersect, never union — and two of them (Status and Drafts)
 * deliberately share the `is:` qualifier, which is exactly the case that breaks
 * if the axes are ever concatenated into a single query: the filter language
 * ORs repeated positive terms of one qualifier to match GitHub, so `is:open
 * is:draft` in one string would mean "open or draft" rather than "open drafts".
 * Applying each axis as its own filter stage is what makes it AND. These tests
 * pin that behaviour down rather than banning the overlap.
 */
describe('the axes intersect rather than union', () => {
  const openReady = pr({ id: 'open-ready', state: 'OPEN', isDraft: false })
  const openDraft = pr({ id: 'open-draft', state: 'OPEN', isDraft: true })
  const mergedDraft = pr({
    id: 'merged-draft',
    state: 'MERGED',
    isDraft: true,
    mergedAt: new Date(NOW - day).toISOString(),
  })
  const all = [openReady, openDraft, mergedDraft]

  const run = (selection: Selection) =>
    applyStages(all, selectionStages(selection), { viewer: 'arye', now: NOW }).map((p) => p.id)

  it('ANDs two axes that share the is: qualifier', () => {
    expect(run({ ...DEFAULT_SELECTION, status: 'open', draft: 'only' })).toEqual(['open-draft'])
    expect(run({ ...DEFAULT_SELECTION, status: 'open', draft: 'hide' })).toEqual(['open-ready'])
    expect(run({ ...DEFAULT_SELECTION, status: 'merged', draft: 'only' })).toEqual(['merged-draft'])
  })

  it('would union them if the axes were concatenated, which is why they are not', () => {
    const concatenated = 'is:open is:draft'
    expect(applyStages(all, [concatenated], { viewer: 'arye', now: NOW })).toHaveLength(3)
    expect(applyStages(all, ['is:open', 'is:draft'], { viewer: 'arye', now: NOW })).toHaveLength(1)
  })

  it('sorts merged pull requests by merge date, newest first', () => {
    const older = pr({
      id: 'older',
      state: 'MERGED',
      mergedAt: new Date(NOW - 10 * day).toISOString(),
      updatedAt: new Date(NOW - day).toISOString(),
    })
    const newer = pr({
      id: 'newer',
      state: 'MERGED',
      mergedAt: new Date(NOW - day).toISOString(),
      updatedAt: new Date(NOW - 10 * day).toISOString(),
    })
    expect(
      applyStages(
        [older, newer],
        selectionStages({ ...DEFAULT_SELECTION, status: 'merged' }),
        { viewer: 'arye', now: NOW },
      ).map((p) => p.id),
    ).toEqual(['newer', 'older'])
  })
})

describe('needsClosed', () => {
  it('is false only for the default Open view, because closed costs a request', () => {
    expect(needsClosed(DEFAULT_SELECTION)).toBe(false)
    expect(needsClosed({ ...DEFAULT_SELECTION, status: 'merged' })).toBe(true)
    expect(needsClosed({ ...DEFAULT_SELECTION, status: 'closed' })).toBe(true)
    expect(needsClosed({ ...DEFAULT_SELECTION, status: 'all' })).toBe(true)
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
    facetCounts(prs, facet(id), selection, [text], 'arye', NOW)

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
    const counts = facetCounts(unknown, facet('state'), DEFAULT_SELECTION, [''], 'arye', NOW)
    expect(counts.awaiting).toBe(0)
    expect(counts.any).toBe(1)
  })
})
