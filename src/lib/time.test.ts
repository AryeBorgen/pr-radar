import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './time'

const NOW = Date.parse('2026-09-04T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

/*
 * Properties, not exact strings.
 *
 * These asserted the words Intl produced, and CI disagreed with this machine:
 * a different ICU version renders two hours in Hebrew as "לפני שעתיים (2)"
 * rather than "לפני שעתיים". The exact wording is ICU's to change and is not
 * what this module promises. What it promises is that the *shape* is the
 * locale's -- a compact suffix in English, a leading preposition and a dual in
 * Hebrew -- and that is what is asserted.
 */
describe('how long ago', () => {
  it('stays as compact in English as the hand-built version was', () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW, 'en')).toMatch(/^3\s?d(ays?)? ago$/)
    expect(relativeTime(ago(5 * 3_600_000), NOW, 'en')).toMatch(/^5\s?h(ours?|r\.?)? ago$/)
  })

  // The reason this went through Intl rather than a suffix table: Hebrew puts
  // the preposition first, and has a dual form. "שעתיים" is not a number and a
  // unit stuck together, and no amount of string building produces it.
  it('puts the preposition first in Hebrew, as Hebrew does', () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW, 'he')).toMatch(/^לפני /)
    expect(relativeTime(ago(3 * 86_400_000), NOW, 'he')).toContain('ימים')
  })

  it('uses the Hebrew dual, which no number-plus-unit produces', () => {
    const twoHours = relativeTime(ago(2 * 3_600_000), NOW, 'he')
    expect(twoHours).toContain('שעתיים')
    // And specifically not "2 שעות", which is what building the string by hand
    // would have given.
    expect(twoHours).not.toContain('2 שעות')
  })

  it('picks the largest unit that still reads as a number', () => {
    expect(relativeTime(ago(30_000), NOW, 'en')).toMatch(/^30\s?s/)
    expect(relativeTime(ago(90_000), NOW, 'en')).toMatch(/^1\s?m/)
    expect(relativeTime(ago(2 * 86_400_000 * 30), NOW, 'en')).toMatch(/^2\s?mo/)
    expect(relativeTime(ago(400 * 86_400_000), NOW, 'en')).toMatch(/^1\s?y/)
  })

  // A pull request opened in the future is a clock difference between the
  // reader and GitHub, not news. "in 3 days" in a list of ages is confusing.
  it('never reports a time in the future', () => {
    const future = new Date(NOW + 3 * 86_400_000).toISOString()
    expect(relativeTime(future, NOW, 'en')).not.toContain('in ')
    expect(relativeTime(future, NOW, 'he')).not.toContain('בעוד')
  })

  it('handles a timestamp it cannot parse without throwing', () => {
    expect(() => relativeTime('not a date', NOW, 'en')).not.toThrow()
  })
})

describe('the exact timestamp', () => {
  it('is formatted for the locale', () => {
    const en = absoluteTime('2026-09-04T12:00:00Z', 'en')
    const he = absoluteTime('2026-09-04T12:00:00Z', 'he')
    expect(en).not.toBe('')
    expect(he).not.toBe('')
    // Not the same string: if they were, the locale was being ignored.
    expect(he).not.toBe(en)
  })
})
