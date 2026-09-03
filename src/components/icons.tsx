import type { CheckState } from '../types'

/** Octicon-derived glyphs, inlined so the app ships no icon dependency. */

const base = 'shrink-0'

export function PrIcon({ draft }: { draft: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={`${base} ${draft ? 'text-neutral-500' : 'text-emerald-600 dark:text-emerald-500'}`}
      fill="currentColor"
    >
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  )
}

export function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'NONE' || state === 'UNKNOWN') return null

  const look = {
    SUCCESS: { className: 'text-emerald-600 dark:text-emerald-500', label: 'All checks passed' },
    FAILURE: { className: 'text-red-600 dark:text-red-500', label: 'Some checks failed' },
    PENDING: { className: 'text-amber-500', label: 'Checks running' },
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
