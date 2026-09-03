const UNITS: [limit: number, divisor: number, suffix: string][] = [
  [60_000, 1000, 's'],
  [3_600_000, 60_000, 'm'],
  [86_400_000, 3_600_000, 'h'],
  [2_592_000_000, 86_400_000, 'd'],
  [31_536_000_000, 2_592_000_000, 'mo'],
  [Infinity, 31_536_000_000, 'y'],
]

/** Compact relative age, e.g. `3h`, `12d`. Sized for a dense list. */
export function relativeAge(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(iso))
  for (const [limit, divisor, suffix] of UNITS) {
    if (elapsed < limit) return `${Math.floor(elapsed / divisor)}${suffix}`
  }
  return 'now'
}

/** Absolute timestamp for the `title` tooltip, where precision is welcome. */
export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
