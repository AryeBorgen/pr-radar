import { useEffect, useRef, useState } from 'react'
import { useSlots } from './slots'
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
  const { Button } = useSlots()
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
      <Button
        variant="default"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('header.language')}
      >
        {current?.name ?? locale}
      </Button>
      {open && (
        <div
          role="listbox"
          // `end-0` rather than `right-0`: the menu hangs off the trailing edge
          // of its button, which is the left one in a right-to-left page.
          className="pr:absolute pr:end-0 pr:z-20 pr:mt-1 pr:min-w-36 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-white pr:py-1 pr:shadow-lg pr:dark:border-neutral-800 pr:dark:bg-neutral-900"
        >
          {LOCALES.map((option) => (
            <Button
              key={option.code}
              variant="menuitem"
              role="option"
              aria-selected={option.code === locale}
              lang={option.code}
              onClick={() => {
                setLocale(option.code)
                setOpen(false)
              }}
            >
              {option.code === locale ? <strong>{option.name}</strong> : option.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
