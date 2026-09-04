import type { Locale } from '../i18n/types'

/**
 * Times, in the reader's language.
 *
 * This used to build `3d` by hand and let the component append " ago". That is
 * fine in English and wrong everywhere else: Hebrew puts the preposition first
 * ("לפני 3 ימים") and has a dual form, so two hours is "שעתיים" rather than
 * anything a number and a suffix can produce.
 *
 * `Intl.RelativeTimeFormat` knows all of that per locale, and `narrow` keeps
 * English exactly as compact as the hand-built version was -- `3d ago` -- which
 * is what a dense list needs. Nothing is lost by using the platform here.
 */

/** Largest unit that still gives a number worth reading. */
const UNITS: [limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60_000, 1000, 'second'],
  [3_600_000, 60_000, 'minute'],
  [86_400_000, 3_600_000, 'hour'],
  [2_592_000_000, 86_400_000, 'day'],
  [31_536_000_000, 2_592_000_000, 'month'],
  [Infinity, 31_536_000_000, 'year'],
]

const relative = new Map<string, Intl.RelativeTimeFormat>()
function formatterFor(locale: Locale): Intl.RelativeTimeFormat {
  let found = relative.get(locale)
  if (found === undefined) {
    // `numeric: 'always'`, not 'auto'. 'auto' turns 1 day into "yesterday",
    // which reads oddly in a column of "3d ago" and "12d ago" -- the list is
    // scanned for magnitude, not read as prose.
    found = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
    relative.set(locale, found)
  }
  return found
}

/**
 * How long ago, phrased for the locale.
 *
 * Always in the past: a timestamp in the future is clamped to zero rather than
 * rendered as "in 3 days", because a pull request opened in the future is a
 * clock difference between the reader and GitHub, not news.
 */
export function relativeTime(iso: string, now: number, locale: Locale): string {
  const elapsed = Math.max(0, now - Date.parse(iso))
  for (const [limit, divisor, unit] of UNITS) {
    if (elapsed < limit) return formatterFor(locale).format(-Math.floor(elapsed / divisor), unit)
  }
  return formatterFor(locale).format(0, 'second')
}

/** Absolute timestamp for the `title` tooltip, where precision is welcome. */
export function absoluteTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale)
}
