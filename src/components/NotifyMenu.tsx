import { useEffect, useRef, useState } from 'react'
import { NOTIFY_RULES } from '../lib/notifications'
import { permissionOf } from '../lib/useNotifications'

interface Props {
  enabled: Record<string, boolean>
  onChange: (enabled: Record<string, boolean>) => void
}

export default function NotifyMenu({ enabled, onChange }: Props) {
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
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        title={on ? 'Notifications are on' : 'Notifications are off'}
        className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{on ? '🔔' : '🔕'}</span>
        <span className="sr-only">Notifications</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <p className="text-sm font-semibold">Notify me when…</p>

          <ul className="mt-2 space-y-1">
            {NOTIFY_RULES.map((rule) => (
              <li key={rule.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={enabled[rule.id] ?? false}
                    onChange={(event) =>
                      onChange({ ...enabled, [rule.id]: event.target.checked })
                    }
                  />
                  {rule.label}
                </label>
              </li>
            ))}
          </ul>

          {permission === 'unsupported' ? (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              This browser does not support notifications. The tab title still shows how many
              pull requests are waiting on you.
            </p>
          ) : permission === 'granted' ? (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Notifications are on. They arrive while this tab is open — there is no server here
              to push to you when it is closed. The tab title always shows the count.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={ask}
                disabled={permission === 'denied'}
                className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {permission === 'denied' ? 'Blocked by the browser' : 'Enable notifications'}
              </button>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
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
