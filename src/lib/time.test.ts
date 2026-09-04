import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './time'

const NOW = Date.parse('2026-09-04T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('how long ago', () => {
  it('stays as compact in English as the hand-built version was', () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW, 'en')).toBe('3d ago')
    expect(relativeTime(ago(5 * 3_600_000), NOW, 'en')).toBe('5h ago')
  })

  // The reason this went through Intl rather than a suffix table: Hebrew puts
  // the preposition first, and has a dual form. "שעתיים" is not a number and a
  // unit stuck together, and no amount of string building produces it.
  it('uses Hebrew grammar, including the dual', () => {
    expect(relativeTime(ago(3 * 86_400_000), NOW, 'he')).toBe('לפני 3 ימים')
    expect(relativeTime(ago(2 * 3_600_000), NOW, 'he')).toBe('לפני שעתיים')
  })

  it('picks the largest unit that still reads as a number', () => {
    expect(relativeTime(ago(30_000), NOW, 'en')).toBe('30s ago')
    expect(relativeTime(ago(90_000), NOW, 'en')).toBe('1m ago')
    expect(relativeTime(ago(2 * 86_400_000 * 30), NOW, 'en')).toBe('2mo ago')
    expect(relativeTime(ago(400 * 86_400_000), NOW, 'en')).toBe('1y ago')
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
