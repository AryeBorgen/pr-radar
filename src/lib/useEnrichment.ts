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
): { prs: PullRequest[]; pending: number } {
  const cache = useRef(new Map<string, Enrichment>())
  const inFlight = useRef(new Set<string>())
  const [pending, setPending] = useState(0)
  const [, render] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const todo = prs.filter((pr) => {
      const key = enrichmentKey(pr)
      return !cache.current.has(key) && !inFlight.current.has(key)
    })
    if (todo.length === 0) return

    for (const pr of todo) inFlight.current.add(enrichmentKey(pr))
    setPending((count) => count + todo.length)

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
        setPending((count) => count - 1)
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
      setPending((count) => Math.max(0, count - queue.length))
    }
  }, [prs, token])

  const merged = prs.map((pr) => {
    const enrichment = cache.current.get(enrichmentKey(pr))
    return enrichment ? { ...pr, ...enrichment } : pr
  })

  return { prs: merged, pending }
}
