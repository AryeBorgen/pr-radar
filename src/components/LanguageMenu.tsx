import { useEffect, useRef, useState } from 'react'
import { LOCALES } from '../i18n/translate'
import { useLocale } from '../i18n/useLocale'

/**
 * Choosing a language.
 *
 * Each language is written in itself -- "עברית", not "Hebrew" -- because
 * someone looking for their own language is, by definition, not reading the
 * current one.
 */
export default function LanguageMenu() {
  const { locale, setLocale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const current = LOCALES.find((l) => l.code === locale)

  return (
    <div className="pr:relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('header.language')}
        className="pr:rounded-md pr:border pr:border-neutral-300 pr:px-2.5 pr:py-1 pr:text-sm pr:hover:bg-neutral-100 pr:dark:border-neutral-700 pr:dark:hover:bg-neutral-800"
      >
        {current?.name ?? locale}
      </button>
      {open && (
        <div
          role="listbox"
          // `end-0` rather than `right-0`: the menu hangs off the trailing edge
          // of its button, which is the left one in a right-to-left page.
          className="pr:absolute pr:end-0 pr:z-20 pr:mt-1 pr:min-w-36 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-white pr:py-1 pr:shadow-lg pr:dark:border-neutral-800 pr:dark:bg-neutral-900"
        >
          {LOCALES.map((option) => (
            <button
              key={option.code}
              type="button"
              role="option"
              aria-selected={option.code === locale}
              lang={option.code}
              onClick={() => {
                setLocale(option.code)
                setOpen(false)
              }}
              className={`pr:block pr:w-full pr:px-3 pr:py-1.5 pr:text-start pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800 ${
                option.code === locale
                  ? 'pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100'
                  : 'pr:text-neutral-600 pr:dark:text-neutral-400'
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
