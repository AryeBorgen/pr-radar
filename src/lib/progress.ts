/**
 * How far along a load is, as one number.
 *
 * A first load is two different pieces of work with different sizes. The list
 * is one request per repository, six at a time -- fifteen repositories on a
 * typical setup. Enrichment is two requests per open pull request, which on the
 * same setup is around three hundred. So the second phase is most of the wait,
 * and a bar that gave the two halves equal weight would sit at 50% for almost
 * the whole load and then finish in a rush.
 *
 * The size of the second phase is not knowable while the first is running --
 * nobody knows how many open pull requests there are until the list comes back.
 * `LIST_SHARE` is therefore a fixed weighting rather than a measurement, and it
 * is the one approximation in this file. It is set from the request counts in
 * CLAUDE.md's budget: roughly 15 requests against roughly 300.
 */

/** The share of the bar the repository phase occupies. See above. */
export const LIST_SHARE = 0.28

export interface LoadProgress {
  /** Repositories whose list request has come back. */
  reposDone: number
  reposTotal: number
  /** Open pull requests whose review and check state has arrived. */
  enrichedDone: number
  enrichedTotal: number
}

/**
 * 0 to 1, or null when there is nothing to report.
 *
 * Null rather than 1: "finished" and "not started" are the same thing to a
 * progress bar that should not be on screen, and collapsing them here means the
 * component never has to decide.
 */
export function fraction(p: LoadProgress): number | null {
  if (p.reposTotal <= 0) return null

  const list = clamp(p.reposDone / p.reposTotal)
  if (list < 1) return list * LIST_SHARE

  // The list is done. If nothing needed enriching -- every repository empty, or
  // every head SHA already cached -- the load is over.
  if (p.enrichedTotal <= 0) return null

  const enriched = clamp(p.enrichedDone / p.enrichedTotal)
  if (enriched >= 1) return null

  return LIST_SHARE + enriched * (1 - LIST_SHARE)
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Whether the bar should be on screen at all.
 *
 * A poll runs every two minutes and usually finds nothing new: the list comes
 * back from cache-ish in a few hundred milliseconds and no enrichment is
 * needed. Showing a bar for that is a flicker at the top of the screen twice a
 * minute, which is worse than showing nothing.
 *
 * So the bar waits. `DELAY_MS` is how long work has to be running before it is
 * worth mentioning -- long enough that a fast poll never shows one, short
 * enough that a real load is reported almost immediately.
 */
export const DELAY_MS = 250

export function shouldShow(progress: number | null, runningMs: number): boolean {
  return progress !== null && runningMs >= DELAY_MS
}
