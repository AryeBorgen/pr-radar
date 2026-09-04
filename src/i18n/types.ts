/**
 * The type system doing the work a translation process usually does by hand.
 *
 * English is the source of truth. Every other catalogue is typed against it, so
 * a missing key, a missing plural form, or a message whose placeholders do not
 * match the English one is a compile error rather than a string that renders as
 * a key in production.
 *
 * There is no i18n library here on purpose. What a library would give us is
 * plural rules and formatting, and the platform already has both, correctly and
 * per locale: `Intl.PluralRules`, `Intl.RelativeTimeFormat`, `Intl.NumberFormat`.
 * What it would cost is a runtime dependency on every page that embeds the
 * radar. The interesting part -- knowing at build time that a translation is
 * complete -- is not something a library does at all.
 */

/** Locales this app ships. Adding one is a compile error until it is complete. */
export type Locale = 'en' | 'he'

/**
 * The plural categories each locale actually uses, per CLDR.
 *
 * Hardcoded because a type cannot ask `Intl` at compile time -- and asserted
 * against `Intl.PluralRules` at test time, so if ICU ever revises a locale the
 * suite says so instead of the types being quietly wrong. Hebrew is `one`,
 * `two` and `other`: two of something takes its own form ("שתי בקשות"), which
 * an English-shaped catalogue has no place to put.
 */
export type PluralCategory<L extends Locale> = L extends 'he'
  ? 'one' | 'two' | 'other'
  : 'one' | 'other'

/**
 * The placeholders in a message, read off the message itself.
 *
 * `'{count} of {total}'` yields `'count' | 'total'`, so `t()` demands exactly
 * those and rejects a typo. This is why messages are declared `as const`: the
 * literal type is the schema.
 */
export type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never

/** A message is either plain text or one form per plural category. */
export type Message = string | Readonly<Record<string, string>>

/**
 * The same message in another locale: plain where English is plain, and with
 * exactly this locale's plural categories where English has forms.
 */
export type Translated<M extends Message, L extends Locale> = M extends string
  ? string
  : { readonly [C in PluralCategory<L>]: string }

/** A complete catalogue for one locale, measured against the English one. */
export type Catalogue<Source extends Readonly<Record<string, Message>>, L extends Locale> = {
  readonly [K in keyof Source]: Translated<Source[K], L>
}

/**
 * Every placeholder in a message, across all its plural forms.
 *
 * A plural message interpolates the same names in each form, so taking the
 * union is right: a form that forgot `{count}` is still type-correct here, and
 * is caught by the test that renders every form instead.
 */
export type MessagePlaceholders<M extends Message> = M extends string
  ? Placeholders<M>
  : M extends Readonly<Record<string, infer F>>
    ? F extends string
      ? Placeholders<F>
      : never
    : never

/** What `t()` must be given for a particular key: nothing, or exactly its placeholders. */
export type Values<M extends Message> = M extends string
  ? [Placeholders<M>] extends [never]
    ? void
    : Readonly<Record<Placeholders<M>, string | number>>
  : // A plural message always needs `count`: it is what selects the form.
    Readonly<Record<MessagePlaceholders<M> | 'count', string | number>> &
      Readonly<{ count: number }>
