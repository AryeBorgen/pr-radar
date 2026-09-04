import type { CheckState, PullState } from '../types'

/** Octicon-derived glyphs, inlined so the app ships no icon dependency. */

const base = 'pr:shrink-0'

const OPEN_PATH =
  'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z'

const MERGED_PATH =
  'M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z'

const CLOSED_PATH =
  'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM2.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.78-9.53a.75.75 0 0 1 1.06 1.06L12.06 5.5l2.03 2.03a.75.75 0 1 1-1.06 1.06l-2.03-2.03-2.03 2.03a.75.75 0 1 1-1.06-1.06L9.94 5.5 7.91 3.47a.75.75 0 0 1 1.06-1.06L11 4.44Z'

/** The glyph carries the state, matching where GitHub puts it. */
export function PrIcon({ state, draft }: { state: PullState; draft: boolean }) {
  const look =
    state === 'MERGED'
      ? { path: MERGED_PATH, className: 'pr:text-purple-600 pr:dark:text-purple-400', label: 'Merged' }
      : state === 'CLOSED'
        ? { path: CLOSED_PATH, className: 'pr:text-red-600 pr:dark:text-red-500', label: 'Closed' }
        : draft
          ? { path: OPEN_PATH, className: 'pr:text-neutral-500', label: 'Draft' }
          : {
              path: OPEN_PATH,
              className: 'pr:text-emerald-600 pr:dark:text-emerald-500',
              label: 'Open',
            }

  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      role="img"
      aria-label={look.label}
      className={`${base} ${look.className}`}
      fill="currentColor"
    >
      <title>{look.label}</title>
      <path d={look.path} />
    </svg>
  )
}

export function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'NONE' || state === 'UNKNOWN') return null

  const look = {
    SUCCESS: { className: 'pr:text-emerald-600 pr:dark:text-emerald-500', label: 'All checks passed' },
    FAILURE: { className: 'pr:text-red-600 pr:dark:text-red-500', label: 'Some checks failed' },
    PENDING: { className: 'pr:text-amber-500', label: 'Checks running' },
  }[state]

  const path = {
    SUCCESS:
      'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0Z',
    FAILURE:
      'M2.343 13.657A8 8 0 1 1 13.658 2.342 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.75.75 0 0 0-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 1 0 1.06 1.06L8 9.06l1.97 1.97a.75.75 0 1 0 1.06-1.06L9.06 8l1.97-1.97a.75.75 0 1 0-1.06-1.06L8 6.94Z',
    PENDING:
      'M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm6.5-3a1 1 0 1 1 0 6 1 1 0 0 1 0-6Z',
  }[state]

  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      role="img"
      aria-label={look.label}
      className={`${base} ${look.className}`}
      fill="currentColor"
    >
      <title>{look.label}</title>
      <path d={path} />
    </svg>
  )
}
