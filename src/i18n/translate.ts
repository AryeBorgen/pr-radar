import { en, type MessageKey, type Messages } from './en'
import { he } from './he'
import type { Locale, Message, Values } from './types'

/**
 * Selecting a message and filling it in. Pure, and unaware of React.
 */

export const CATALOGUES: Readonly<Record<Locale, Readonly<Record<string, Message>>>> = { en, he }

/** Locales in the order a picker should show them, with their own names. */
export const LOCALES: ReadonlyArray<{ code: Locale; name: string; dir: 'ltr' | 'rtl' }> = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'he', name: 'עברית', dir: 'rtl' },
]

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.code === locale)?.dir ?? 'ltr'
}

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value)
}

/**
 * Which of a locale's plural forms applies to `count`.
 *
 * `Intl.PluralRules` rather than a rule table, because the rules are genuinely
 * intricate and getting them wrong is invisible to anyone who does not speak
 * the language. Hebrew's `two` is the example that matters here: two of
 * something takes its own form, and a hand-rolled `n === 1 ? one : other` would
 * silently produce nonsense for every pair.
 */
const rules = new Map<Locale, Intl.PluralRules>()
function pluralFormFor(locale: Locale, count: number): string {
  let rule = rules.get(locale)
  if (rule === undefined) {
    rule = new Intl.PluralRules(locale)
    rules.set(locale, rule)
  }
  return rule.select(count)
}

/**
 * Substitute `{name}` placeholders.
 *
 * A placeholder with no value is left as it is rather than rendered as
 * `undefined`. The types make that unreachable through `t()`, and this is what
 * happens if it is reached anyway -- a visible `{name}` is a bug report, and
 * `undefined` in a sentence is a mystery.
 */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * Look a message up, falling back to English rather than showing a key.
 *
 * The fallback is unreachable while the catalogues type-check -- which they
 * must, since `he.ts` is typed against `en.ts`. It exists for the case the
 * types cannot cover: a build where a catalogue was replaced at runtime.
 */
export function resolve(locale: Locale, key: string): Message | undefined {
  const catalogue = CATALOGUES[locale]
  return catalogue[key] ?? CATALOGUES.en[key]
}

export function translate(
  locale: Locale,
  key: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const message = resolve(locale, key)
  if (message === undefined) return key

  if (typeof message === 'string') return fill(message, values ?? {})

  const count = typeof values?.['count'] === 'number' ? values['count'] : 0
  const form = pluralFormFor(locale, count)
  // `other` is the only category every locale defines, so it is the one safe
  // fallback when a form is somehow absent.
  const text = message[form] ?? message['other'] ?? key
  return fill(text, values ?? {})
}

/** The typed front door. `key` decides whether values are required, and which. */
export type Translator = <K extends MessageKey>(
  key: K,
  ...values: Values<Messages[K]> extends void ? [] : [Values<Messages[K]>]
) => string

export function translatorFor(locale: Locale): Translator {
  return ((key: string, values?: Readonly<Record<string, string | number>>) =>
    translate(locale, key, values)) as Translator
}
