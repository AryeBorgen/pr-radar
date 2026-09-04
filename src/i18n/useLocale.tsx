import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { directionOf, isLocale, LOCALES, translatorFor, type Translator } from './translate'
import type { Locale } from './types'

/**
 * Which language, and how the page knows.
 *
 * Order of preference: what the reader chose last time, then what their browser
 * asks for, then English. The browser's preference is consulted through
 * `Intl.Locale`-style matching on the language subtag, so `he-IL` finds Hebrew.
 */

const STORAGE_KEY = 'pr-radar.locale'

export function preferredLocale(
  stored: string | null,
  languages: readonly string[],
): Locale {
  if (isLocale(stored)) return stored
  for (const requested of languages) {
    // Match the language subtag, not the whole tag: a reader asking for `he-IL`
    // wants Hebrew, and comparing the full tag would miss it.
    const base = requested.toLowerCase().split('-')[0]
    const found = LOCALES.find((l) => l.code === base)
    if (found) return found.code
  }
  return 'en'
}

interface LocaleContext {
  locale: Locale
  dir: 'ltr' | 'rtl'
  setLocale: (locale: Locale) => void
  t: Translator
}

const Context = createContext<LocaleContext | null>(null)

function read(): Locale {
  if (typeof localStorage === 'undefined') return 'en'
  try {
    return preferredLocale(localStorage.getItem(STORAGE_KEY), navigator.languages ?? [])
  } catch {
    // A browser with storage blocked still has a language preference.
    return preferredLocale(null, navigator.languages ?? [])
  }
}

export interface LocaleProviderProps {
  children: React.ReactNode
  /**
   * Start here rather than at what the reader last chose. The embedded radar
   * takes its language from the host, which knows better than this component
   * does what the surrounding page is written in.
   */
  initial?: Locale
  /**
   * Write `lang` and `dir` onto `<html>`. True for the standalone page, which
   * owns the document; false for the embedded radar, which does not -- setting
   * a host page to right-to-left because a widget in the corner is Hebrew would
   * re-lay-out somebody else's application.
   */
  applyToDocument?: boolean
}

export function LocaleProvider({
  children,
  initial,
  applyToDocument = true,
}: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? read())
  const dir = directionOf(locale)

  // A host that changes the language it passes should change the radar's.
  useEffect(() => {
    if (initial !== undefined) setLocaleState(initial)
  }, [initial])

  /*
   * `lang` and `dir` go on <html>, not on a wrapper.
   *
   * `dir` on a div would leave anything rendered into a portal -- and the
   * browser's own UI for form controls, spellcheck and text selection -- still
   * laid out left to right. Screen readers take the language from <html> too.
   *
   * The embedded library cannot do this, since the document is the host's. It
   * sets `dir` on its own root instead, which is why every component uses
   * logical properties rather than left and right.
   */
  useEffect(() => {
    if (!applyToDocument) return
    const root = document.documentElement
    root.lang = locale
    root.dir = dir
  }, [locale, dir, applyToDocument])

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next)
      // The embedded radar stores nothing at all -- not a token, not a setting,
      // not this. A widget that writes to storage in a page you did not write
      // is a widget you cannot reason about.
      if (!applyToDocument) return
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Not being able to remember the choice is not a reason to refuse it.
      }
    },
    [applyToDocument],
  )

  const value = useMemo(
    () => ({ locale, dir, setLocale, t: translatorFor(locale) }),
    [locale, dir, setLocale],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLocale(): LocaleContext {
  const value = useContext(Context)
  if (value === null) {
    // Rendering English rather than throwing would be worse: it would look like
    // it worked, in one language, until someone noticed.
    throw new Error('useLocale must be used inside a LocaleProvider')
  }
  return value
}

/** The common case: just the translator. */
export function useT(): Translator {
  return useLocale().t
}
