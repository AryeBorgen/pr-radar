import { describe, expect, it } from 'vitest'
import { applyStages } from './filter'
import { DEFAULT_PERIOD, PERIOD_OPTIONS, menuStages, periodQuery } from './menus'
import type { PullRequest } from '../types'

const NOW = Date.parse('2026-09-03T12:00:00Z')
const day = 86_400_000
const ago = (d: number) => new Date(NOW - d * day).toISOString()

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
    createdAt: ago(200),
    updatedAt: ago(1),
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

const merged = (id: string, daysAgo: number) =>
  pr({ id, state: 'MERGED', mergedAt: ago(daysAgo), closedAt: ago(daysAgo), updatedAt: ago(1) })

const run = (prs: PullRequest[], stages: string[]) =>
  applyStages(prs, stages, { viewer: 'arye', now: NOW }).map((p) => p.id)

describe('the period filter', () => {
  it('defaults to the past month', () => {
    expect(DEFAULT_PERIOD).toBe('1mo')
    expect(periodQuery(DEFAULT_PERIOD)).toBe('closed:>1mo')
  })

  it('keeps what closed inside the window and drops what closed before it', () => {
    const list = [merged('yesterday', 1), merged('three-weeks', 21), merged('two-months', 60)]
    expect(run(list, [periodQuery('1mo')])).toEqual(['yesterday', 'three-weeks'])
    expect(run(list, [periodQuery('7d')])).toEqual(['yesterday'])
    expect(run(list, [periodQuery('3mo')])).toEqual(['yesterday', 'three-weeks', 'two-months'])
  })

  it('places no bound at all on All time', () => {
    expect(periodQuery('all')).toBe('')
    expect(run([merged('ancient', 900)], [periodQuery('all')])).toEqual(['ancient'])
  })

  /*
   * The reason the period reads closedAt and not updatedAt: GitHub can only
   * sort closed PRs by update time, so an old merge that was commented on
   * yesterday arrives near the top of the page. It must still fall outside a
   * one-month window.
   */
  it('judges by when the PR closed, not when it was last touched', () => {
    const old = pr({
      id: 'old-merge-new-comment',
      state: 'MERGED',
      mergedAt: ago(90),
      closedAt: ago(90),
      updatedAt: ago(1),
    })
    expect(run([old], [periodQuery('1mo')])).toEqual([])
    expect(run([old], ['updated:>1mo'])).toEqual(['old-merge-new-comment'])
  })

  it('never applies the period to open pull requests, which have no close date', () => {
    const open = pr({ id: 'open' })
    // With closed PRs out of scope the stage is absent, so open PRs survive.
    expect(run([open], menuStages({}, '', '1mo', false))).toEqual(['open'])
    // And were it applied, an open PR would correctly fail a bound on closing.
    expect(run([open], [periodQuery('1mo')])).toEqual([])
  })

  it('offers a month, and every option is a valid query', () => {
    expect(PERIOD_OPTIONS.map((option) => option.value)).toContain('1mo')
    for (const option of PERIOD_OPTIONS) {
      expect(() => run([merged('x', 2)], [option.query])).not.toThrow()
    }
  })
})

describe('age units', () => {
  it('reads mo as thirty days and y as three hundred and sixty-five', () => {
    const list = [merged('d40', 40), merged('d200', 200), merged('d400', 400)]
    expect(run(list, ['closed:>1mo'])).toEqual([])
    expect(run(list, ['closed:>3mo'])).toEqual(['d40'])
    expect(run(list, ['closed:>1y'])).toEqual(['d40', 'd200'])
  })
})
