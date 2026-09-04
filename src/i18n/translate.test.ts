import { describe, expect, it } from 'vitest'
import { CATALOGUES, directionOf, isLocale, LOCALES, plain, translate } from './translate'
import { preferredLocale } from './useLocale'
import { en } from './en'
import type { Locale } from './types'

describe('the catalogues', () => {
  // The catalogue types are checked against English at build time. This is the
  // assertion they cannot make: that the plural categories the types hardcode
  // are still the ones ICU uses. If CLDR ever revises a locale -- Hebrew used
  // to have a `many` form and no longer does -- this says so, instead of the
  // types being quietly wrong about a language nobody on the team reads.
  it.each(LOCALES.map((l) => l.code))('%s declares exactly the plural forms Intl uses', (locale) => {
    const expected = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.sort()
    const plurals = Object.entries(CATALOGUES[locale]).filter(
      ([, message]) => typeof message !== 'string',
    )
    expect(plurals.length, 'no plural message to check').toBeGreaterThan(0)
    for (const [key, message] of plurals) {
      expect(Object.keys(message as object).sort(), `${locale} · ${key}`).toEqual(expected)
    }
  })

  it.each(LOCALES.map((l) => l.code))('%s translates every key', (locale) => {
    for (const key of Object.keys(en)) {
      expect(CATALOGUES[locale][key], `${locale} is missing ${key}`).toBeDefined()
    }
  })

  // A translation that dropped `{where}` renders a sentence with a hole in it,
  // and a translation that invented `{url}` renders the braces to the reader.
  it.each(LOCALES.map((l) => l.code))('%s uses the same placeholders as English', (locale) => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const forms = (message: unknown): string[] =>
      typeof message === 'string' ? [message] : Object.values(message as Record<string, string>)

    for (const [key, source] of Object.entries(en)) {
      const expected = new Set(forms(source).flatMap(names))
      for (const form of forms(CATALOGUES[locale][key])) {
        for (const name of names(form)) {
          expect(expected.has(name), `${locale} · ${key} uses {${name}}, English does not`).toBe(true)
        }
      }
    }
  })

  // A message that renders as empty is indistinguishable from a missing element.
  it.each(LOCALES.map((l) => l.code))('%s has no empty message', (locale) => {
    for (const [key, message] of Object.entries(CATALOGUES[locale])) {
      const texts = typeof message === 'string' ? [message] : Object.values(message)
      for (const text of texts) expect(text.trim(), `${locale} · ${key}`).not.toBe('')
    }
  })
})

/*
 * Substituted values carry bidi isolates, so the words are compared with those
 * stripped. What they do -- keep a sentence's punctuation on the correct side
 * when the value is in the other script -- is asserted in its own block below,
 * and in the browser suite where it can actually be seen.
 */
const words = (locale: 'en' | 'he', key: string, values?: Record<string, string | number>) =>
  plain(translate(locale, key, values))

describe('plurals', () => {
  it('picks the English forms', () => {
    expect(words('en', 'header.repositories', { count: 1 })).toBe('1 repository')
    expect(words('en', 'header.repositories', { count: 2 })).toBe('2 repositories')
    expect(words('en', 'header.repositories', { count: 0 })).toBe('0 repositories')
  })

  // The reason plural categories are per locale rather than one-and-other.
  // "שני מאגרים" is a form English has nowhere to put, and rendering the plural
  // form for two would be wrong in a way only a Hebrew reader would notice.
  it('picks the Hebrew two-form, which English does not have', () => {
    expect(words('he', 'header.repositories', { count: 1 })).toBe('מאגר אחד')
    expect(words('he', 'header.repositories', { count: 2 })).toBe('שני מאגרים')
    expect(words('he', 'header.repositories', { count: 7 })).toBe('7 מאגרים')
  })

  it('agrees with Intl for every count it will realistically see', () => {
    for (const locale of ['en', 'he'] as Locale[]) {
      for (let n = 0; n < 120; n++) {
        const form = new Intl.PluralRules(locale).select(n)
        const message = CATALOGUES[locale]['header.repositories'] as Record<string, string>
        const expected = message[form]
        expect(expected, `${locale} has no ${form} form`).toBeDefined()
        expect(words(locale, 'header.repositories', { count: n })).toBe(
          expected!.replace('{count}', String(n)),
        )
      }
    }
  })
})

describe('filling in a message', () => {
  it('substitutes a placeholder', () => {
    expect(words('en', 'header.repositories', { count: 12 })).toBe('12 repositories')
  })

  // `undefined` in a sentence is a mystery; a visible {count} is a bug report.
  // Unreachable through t(), which is typed -- this is what happens anyway.
  it('leaves a placeholder alone rather than rendering undefined', () => {
    expect(words('en', 'header.repositories', {})).toContain('{count}')
  })

  it('falls back to English rather than showing a key', () => {
    expect(translate('he', 'app.name')).toBe('PR Radar')
  })

  it('shows the key only when no catalogue has it at all', () => {
    expect(translate('en', 'nothing.like.this')).toBe('nothing.like.this')
  })
})

describe('choosing a locale', () => {
  it('honours a remembered choice above everything', () => {
    expect(preferredLocale('he', ['en-GB', 'en'])).toBe('he')
  })

  // A reader asking for he-IL wants Hebrew. Comparing whole tags misses it.
  it('matches the language subtag, not the whole tag', () => {
    expect(preferredLocale(null, ['he-IL'])).toBe('he')
  })

  it('takes the first language it can actually serve', () => {
    expect(preferredLocale(null, ['fr-FR', 'he-IL', 'en'])).toBe('he')
  })

  it('falls back to English', () => {
    expect(preferredLocale(null, ['fr-FR', 'de'])).toBe('en')
  })

  it('ignores a stored value that is not a locale', () => {
    expect(preferredLocale('klingon', ['he'])).toBe('he')
    expect(preferredLocale('', [])).toBe('en')
  })
})

describe('direction', () => {
  it('knows Hebrew reads right to left', () => {
    expect(directionOf('he')).toBe('rtl')
    expect(directionOf('en')).toBe('ltr')
  })

  it('recognises the locales it ships and nothing else', () => {
    expect(isLocale('he')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe('a value in the other script', () => {
  /*
   * The bug this exists for, seen in a screenshot: `למזג את acme/web #1?`
   * rendered with the question mark at the *left* end, because the
   * bidirectional algorithm attached it to the Latin run rather than to the
   * Hebrew sentence it belongs to. Isolating the value keeps the punctuation
   * where the sentence put it.
   */
  it('is isolated, so the sentence keeps its own punctuation', () => {
    const text = translate('he', 'action.confirmMerge', { pr: 'acme/web #1' })

    expect(text, 'the value must be wrapped in FSI…PDI').toContain('\u2068acme/web #1\u2069')
    expect(text.endsWith('?'), 'the question mark belongs to the Hebrew sentence').toBe(true)
  })

  // Two values, so two isolates -- and each keeps its own run intact.
  it('isolates every value, not only the first', () => {
    const text = translate('he', 'row.waitingOn', { who: 'octocat' })
    const other = translate('he', 'header.repositories', { count: 42 })

    expect(text).toContain('\u2068octocat\u2069')
    expect(other).toContain('\u206842\u2069')
  })

  // Isolates render as nothing, so the words are unchanged in every language.
  it('changes no word anywhere', () => {
    expect(plain(translate('en', 'action.confirmMerge', { pr: 'acme/web #1' })))
      .toBe('Merge acme/web #1?')
  })
})
