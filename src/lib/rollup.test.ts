import { describe, expect, it } from 'vitest'
import { decideReview, rollupChecks } from './github'

const review = (login: string, state: string) => ({
  user: { login, avatar_url: '' },
  state,
  submitted_at: null,
})

describe('decideReview', () => {
  it('reports no verdict when nobody has reviewed and nobody is asked', () => {
    expect(decideReview([], false)).toEqual({ reviewedBy: [], reviewDecision: 'NONE' })
  })

  it('reports review required when someone is asked but nobody has answered', () => {
    expect(decideReview([], true).reviewDecision).toBe('REVIEW_REQUIRED')
  })

  it('lets a later approval supersede an earlier change request', () => {
    const result = decideReview([review('bob', 'CHANGES_REQUESTED'), review('bob', 'APPROVED')], false)
    expect(result.reviewDecision).toBe('APPROVED')
  })

  it('lets a later change request supersede an earlier approval', () => {
    const result = decideReview([review('bob', 'APPROVED'), review('bob', 'CHANGES_REQUESTED')], false)
    expect(result.reviewDecision).toBe('CHANGES_REQUESTED')
  })

  it('blocks on one reviewer requesting changes even when another approved', () => {
    const result = decideReview([review('bob', 'APPROVED'), review('carol', 'CHANGES_REQUESTED')], false)
    expect(result.reviewDecision).toBe('CHANGES_REQUESTED')
  })

  it('ignores comment-only reviews as verdicts but still credits the reviewer', () => {
    const result = decideReview([review('bob', 'COMMENTED')], false)
    expect(result.reviewDecision).toBe('NONE')
    expect(result.reviewedBy).toEqual(['bob'])
  })

  it('drops a dismissed verdict', () => {
    const result = decideReview([review('bob', 'APPROVED'), review('bob', 'DISMISSED')], true)
    expect(result.reviewDecision).toBe('REVIEW_REQUIRED')
  })
})

describe('rollupChecks', () => {
  const run = (status: string, conclusion: string | null = null) => ({ status, conclusion })

  it('reports none when there are no checks', () => {
    expect(rollupChecks([])).toBe('NONE')
  })

  it('reports success when every run completed cleanly', () => {
    expect(rollupChecks([run('completed', 'success'), run('completed', 'skipped')])).toBe('SUCCESS')
  })

  it('reports pending while a run is still going', () => {
    expect(rollupChecks([run('completed', 'success'), run('in_progress')])).toBe('PENDING')
  })

  it('never rounds a failure up, even alongside a run still in progress', () => {
    expect(rollupChecks([run('in_progress'), run('completed', 'failure')])).toBe('FAILURE')
  })

  it('treats a cancelled or timed-out run as a failure', () => {
    expect(rollupChecks([run('completed', 'cancelled')])).toBe('FAILURE')
    expect(rollupChecks([run('completed', 'timed_out')])).toBe('FAILURE')
  })
})
