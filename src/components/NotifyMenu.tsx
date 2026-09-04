import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useLocale'
import { NOTIFY_RULES } from '../lib/notifications'
import { permissionOf } from '../lib/useNotifications'

interface Props {
  enabled: Record<string, boolean>
  onChange: (enabled: Record<string, boolean>) => void
}

export default function NotifyMenu({ enabled, onChange }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(permissionOf)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function ask() {
    if (permission === 'unsupported') return
    setPermission(await Notification.requestPermission())
  }

  const on = permission === 'granted'

  return (
    <div ref={container} className="pr:relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        title={on ? t('notify.on') : t('notify.off')}
        className="pr:rounded-md pr:px-2 pr:py-1 pr:text-sm pr:text-neutral-600 pr:hover:bg-neutral-100 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{on ? '🔔' : '🔕'}</span>
        <span className="pr:sr-only">{t('notify.label')}</span>
      </button>

      {open && (
        <div className="pr:absolute pr:end-0 pr:z-20 pr:mt-1 pr:w-80 pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:p-3 pr:shadow-lg pr:dark:border-neutral-700 pr:dark:bg-neutral-900">
          <p className="pr:text-sm pr:font-semibold">{t('notify.heading')}</p>

          <ul className="pr:mt-2 pr:space-y-1">
            {NOTIFY_RULES.map((rule) => (
              <li key={rule.id}>
                <label className="pr:flex pr:cursor-pointer pr:items-center pr:gap-2 pr:rounded pr:px-1 pr:py-1 pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={enabled[rule.id] ?? false}
                    onChange={(event) =>
                      onChange({ ...enabled, [rule.id]: event.target.checked })
                    }
                  />
                  {t(rule.label)}
                </label>
              </li>
            ))}
          </ul>

          {permission === 'unsupported' ? (
            <p className="pr:mt-3 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
              {t('notify.unsupported')}
            </p>
          ) : permission === 'granted' ? (
            <p className="pr:mt-3 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
              {t('notify.granted')}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={ask}
                disabled={permission === 'denied'}
                className="pr:mt-3 pr:w-full pr:rounded-md pr:bg-emerald-600 pr:px-3 pr:py-1.5 pr:text-sm pr:font-medium pr:text-white pr:hover:bg-emerald-700 pr:disabled:opacity-50"
              >
                {permission === 'denied' ? t('notify.blocked') : t('notify.enable')}
              </button>
              <p className="pr:mt-2 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
                {permission === 'denied'
                  ? 'Allow notifications for this site in your browser settings to turn them on.'
                  : 'They arrive while this tab is open. There is no server here to push to you when it is closed.'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
