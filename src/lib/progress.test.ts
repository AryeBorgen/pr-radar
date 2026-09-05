import { describe, expect, it } from 'vitest'
import { DELAY_MS, fraction, LIST_SHARE, shouldShow, type LoadProgress } from './progress'

const p = (over: Partial<LoadProgress> = {}): LoadProgress => ({
  reposDone: 0, reposTotal: 15, enrichedDone: 0, enrichedTotal: 0, ...over,
})

describe('how far along', () => {
  it('reports nothing before anything is known', () => {
    expect(fraction(p({ reposTotal: 0 }))).toBeNull()
  })

  it('fills the list share as repositories answer', () => {
    expect(fraction(p({ reposDone: 0 }))).toBe(0)
    expect(fraction(p({ reposDone: 15, reposTotal: 30 }))).toBeCloseTo(LIST_SHARE / 2)
  })

  // The whole reason the phases are weighted. Enrichment is roughly twenty
  // times the requests, so equal halves would park the bar at 50% for most of
  // the load and then finish in a jump.
  it('hands the rest of the bar to enrichment', () => {
    expect(fraction(p({ reposDone: 15, enrichedDone: 0, enrichedTotal: 150 }))).toBe(LIST_SHARE)
    expect(fraction(p({ reposDone: 15, enrichedDone: 75, enrichedTotal: 150 })))
      .toBeCloseTo(LIST_SHARE + (1 - LIST_SHARE) / 2)
  })

  it('never goes backwards between the phases', () => {
    const endOfList = fraction(p({ reposDone: 14, reposTotal: 15 }))!
    const startOfEnrichment = fraction(p({ reposDone: 15, enrichedTotal: 150 }))!
    expect(startOfEnrichment).toBeGreaterThan(endOfList)
  })

  // Null, not 1. "Finished" and "not started" are the same thing to a bar that
  // should not be on screen, and deciding that here means the component never
  // has to.
  it('reports nothing once enrichment is done', () => {
    expect(fraction(p({ reposDone: 15, enrichedDone: 150, enrichedTotal: 150 }))).toBeNull()
  })

  // Every repository empty, or every head SHA already cached from the last
  // poll. Nothing to enrich is not zero progress; it is finished.
  it('reports nothing when there was nothing to enrich', () => {
    expect(fraction(p({ reposDone: 15, enrichedTotal: 0 }))).toBeNull()
  })

  it('stays inside 0 and 1 whatever it is given', () => {
    for (const bad of [
      p({ reposDone: 99, reposTotal: 15 }),
      p({ reposDone: -5, reposTotal: 15 }),
      p({ reposDone: 15, enrichedDone: 999, enrichedTotal: 150 }),
      p({ reposDone: 15, enrichedDone: -1, enrichedTotal: 150 }),
    ]) {
      const value = fraction(bad)
      if (value === null) continue
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('survives a division by zero rather than rendering NaN', () => {
    expect(fraction(p({ reposDone: 5, reposTotal: 0 }))).toBeNull()
    const value = fraction(p({ reposDone: 15, enrichedDone: 5, enrichedTotal: 0 }))
    expect(value).toBeNull()
  })
})

describe('whether to show it at all', () => {
  // A poll runs every two minutes and usually finds nothing. A bar that flashed
  // for it would be a flicker at the top of the screen twice a minute, which is
  // worse than no bar.
  it('stays hidden for work that finishes quickly', () => {
    expect(shouldShow(0.4, DELAY_MS - 1)).toBe(false)
  })

  it('appears once work has been running long enough to be worth saying', () => {
    expect(shouldShow(0.4, DELAY_MS)).toBe(true)
  })

  it('stays hidden when there is no progress to report, however long it has been', () => {
    expect(shouldShow(null, 10_000)).toBe(false)
  })
})
