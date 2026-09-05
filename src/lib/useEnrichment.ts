import { useEffect, useReducer, useRef, useState } from 'react'
import type { Enrichment, PullRequest } from '../types'
import { fetchEnrichment } from './github'

/**
 * Keyed by head SHA, so a PR is re-fetched exactly when the thing being
 * described changes. A poll that finds nothing new costs no requests at all,
 * which is what makes a 120-second refresh affordable on a list of this size.
 */
function enrichmentKey(pr: PullRequest): string {
  return `${pr.repo}#${pr.number}@${pr.headSha}`
}

/** Concurrent enrichment requests. Two per PR, so this is 12 sockets at peak. */
const MAX_CONCURRENT = 6

/** Re-renders are batched: a 160-row list does not want one render per arrival. */
const RENDER_EVERY = 8

const EMPTY: PullRequest[] = []

/**
 * Merge review and check state into the pull request list as it arrives.
 *
 * The list renders immediately from the first pass and fills in progressively.
 * `pending` is exposed so the UI can say that bucket counts are still settling
 * rather than presenting a half-loaded count as final.
 */
export function useEnrichment(
  token: string,
  prs: PullRequest[] = EMPTY,
): { prs: PullRequest[]; pending: number; total: number } {
  const cache = useRef(new Map<string, Enrichment>())
  const inFlight = useRef(new Set<string>())
  /*
   * The run, as one value.
   *
   * `pending` alone cannot drive a progress bar: it counts what is *left*, and
   * a bar needs that out of a total. Held together rather than as two pieces of
   * state so the two can never disagree -- and so a poll that queues five more
   * mid-run widens the denominator in the same update that raises the
   * numerator, instead of the bar jumping backwards between two renders.
   */
  const [run, setRun] = useState({ pending: 0, total: 0 })
  const [, render] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    /*
     * Only open PRs are enriched. Review and check state on a merged PR is
     * history, and buying it would cost two requests each for a list that grows
     * without bound — the budget belongs to the PRs still in play.
     */
    const todo = prs.filter((pr) => {
      if (pr.state !== 'OPEN') return false
      const key = enrichmentKey(pr)
      return !cache.current.has(key) && !inFlight.current.has(key)
    })
    if (todo.length === 0) return

    for (const pr of todo) inFlight.current.add(enrichmentKey(pr))
    // A run that had finished starts a new total; one still going widens.
    setRun((was) =>
      was.pending === 0
        ? { pending: todo.length, total: todo.length }
        : { pending: was.pending + todo.length, total: was.total + todo.length },
    )

    let cancelled = false
    const queue = [...todo]
    let sinceRender = 0

    const worker = async () => {
      while (queue.length > 0 && !cancelled) {
        const pr = queue.shift()
        if (!pr) break
        const key = enrichmentKey(pr)
        try {
          cache.current.set(key, await fetchEnrichment(token, pr))
        } catch {
          // One PR's status failing must not stall the rest or retry forever;
          // it stays UNKNOWN, which the UI and filters already handle.
          cache.current.set(key, {
            reviewedBy: [],
            reviewDecision: 'UNKNOWN',
            checkState: 'UNKNOWN',
          })
        }
        inFlight.current.delete(key)
        setRun((was) => ({ ...was, pending: Math.max(0, was.pending - 1) }))
        if (++sinceRender >= RENDER_EVERY || queue.length === 0) {
          sinceRender = 0
          if (!cancelled) render()
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, todo.length) }, worker))

    return () => {
      cancelled = true
      // Anything still queued was never started, so release it for a later run.
      for (const pr of queue) inFlight.current.delete(enrichmentKey(pr))
      setRun((was) => ({ ...was, pending: Math.max(0, was.pending - queue.length) }))
    }
  }, [prs, token])

  const merged = prs.map((pr) => {
    const enrichment = cache.current.get(enrichmentKey(pr))
    return enrichment ? { ...pr, ...enrichment } : pr
  })

  return { prs: merged, pending: run.pending, total: run.total }
}
