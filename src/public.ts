/**
 * The types the published library exposes, and only those.
 *
 * They live apart from `types.ts` for a reason that is structural rather than
 * tidy: `render.d.ts` imports whatever module these come from, so a consumer's
 * TypeScript reads that whole file. Taking `RepoRef` from `types.ts` pulled
 * `PullRequest` into the public declaration graph -- unreachable through the
 * package's `exports` map, but present, and "present but currently unreachable"
 * is how a surface grows by accident.
 *
 * Nothing here describes data from GitHub. `RepoRef` is what a caller passes
 * in; `Locale` is what they choose. Both are things a host says, not things the
 * API returns, which is the line this file draws.
 */

/** A repository to watch. */
export interface RepoRef {
  owner: string
  name: string
}

/** Languages the radar ships. */
export type Locale = 'en' | 'he'
