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

export function CheckIcon({ state }: { state: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NONE' }) {
  if (state === 'NONE') return null

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

export function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={base} fill="currentColor">
      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.75.75 0 0 1 .53-.22h3.75a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

export function ConflictIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      role="img"
      aria-label="Merge conflict"
      className={`${base} text-red-600 dark:text-red-500`}
      fill="currentColor"
    >
      <title>Merge conflict</title>
      <path d="M4.4 1.4a.75.75 0 1 0-1.1 1.02l.72.79a3.999 3.999 0 0 0-.77 6.28V13.4a2.25 2.25 0 1 0 1.5 0V9.49a4 4 0 0 0 1.98.53h1.06l-1.9-2.08a2.5 2.5 0 0 1-.14-4.63Zm-.65 13.1a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm8.25-1.87V9.99a4 4 0 0 0 .79-6.29l.72-.79a.75.75 0 1 0-1.11-1.01l-.73.8a3.99 3.99 0 0 0-4.62.55l1.07 1.17a2.5 2.5 0 1 1 3.38 3.66l1.07 1.17c.13-.11.25-.23.36-.35v3.83a2.25 2.25 0 1 0 1.5 0ZM12 14.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  )
}
