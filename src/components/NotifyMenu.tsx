import { useCallback, useEffect, useRef, useState } from 'react'
import { useSlots } from './slots'
import { useT } from '../i18n/useLocale'
import { NOTIFY_RULES } from '../lib/notifications'
import { permissionOf } from '../lib/useNotifications'
import { usePush } from '../lib/usePush'
import type { RepoRef } from '../types'

interface Props {
  enabled: Record<string, boolean>
  onChange: (enabled: Record<string, boolean>) => void
  /**
   * What to watch, passed through to the server when push is turned on.
   *
   * The server is told the repositories rather than reading them itself: they
   * are this browser's setting, they are not a credential, and sending them
   * keeps the two in step without the server having to guess.
   */
  repos: RepoRef[]
  /** Who this tab is signed in as, to notice if the server watches as someone else. */
  viewer: string
}

export default function NotifyMenu({ enabled, onChange, repos, viewer }: Props) {
  const { Button } = useSlots()
  const t = useT()
  /*
   * The headlines go to the server in this page's language, because the server
   * has no catalogue and is never going to get one. `useCallback` because the
   * hook depends on it, and a new function every render would resubscribe on
   * every render.
   */
  const headlineFor = useCallback(
    (id: string) => {
      const rule = NOTIFY_RULES.find((candidate) => candidate.id === id)
      return rule ? t(rule.headline) : id
    },
    [t],
  )
  const push = usePush(repos, enabled, headlineFor)
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

          {/*
            Push, where something is awake to do it. On the hosted page there is
            no server behind this, `push/config` answers 404, and this whole
            section is absent rather than being a switch that cannot work.
          */}
          {/*
            Reached over a plain network address, where a service worker cannot
            exist. Saying so is the whole point: otherwise a phone pointed at a
            laptop shows the dashboard, offers no push, and explains nothing.
          */}
          {push.insecure && (
            <p className="pr:mt-3 pr:border-t pr:border-neutral-200 pr:pt-3 pr:text-xs pr:text-amber-700 pr:dark:border-neutral-700 pr:dark:text-amber-500">
              {t('push.needsHttps')}
            </p>
          )}

          {push.available && (
            <div className="pr:mt-3 pr:border-t pr:border-neutral-200 pr:pt-3 pr:dark:border-neutral-700">
              <p className="pr:text-sm pr:font-semibold">{t('push.heading')}</p>
              <p className="pr:mt-1 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
                {t('push.explain')}
              </p>

              {/*
                The server polls with its own token. If that is a different
                account from the one in this tab, the notifications describe
                somebody else's work -- which is worth saying out loud rather
                than leaving to be discovered.
              */}
              {push.serverViewer && viewer && push.serverViewer !== viewer && (
                <p className="pr:mt-1 pr:text-xs pr:text-amber-700 pr:dark:text-amber-500">
                  {t('push.differentAccount', { who: push.serverViewer })}
                </p>
              )}

              <div className="pr:mt-2 pr:[&>button]:w-full">
                <Button
                  variant={push.subscribed ? 'default' : 'primary'}
                  onClick={() => void (push.subscribed ? push.disable() : push.enable())}
                  disabled={push.busy}
                >
                  {push.busy
                    ? t('action.working')
                    : push.subscribed
                      ? t('push.disable')
                      : t('push.enable')}
                </Button>
              </div>

              <p
                role="status"
                className={
                  push.error
                    ? 'pr:mt-2 pr:text-xs pr:text-red-700 pr:dark:text-red-400'
                    : 'pr:mt-2 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400'
                }
              >
                {push.error ? t(push.error) : push.subscribed ? t('push.on') : ''}
              </p>
            </div>
          )}

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
              <div className="pr:mt-3 pr:[&>button]:w-full">
                <Button variant="primary" onClick={ask} disabled={permission === 'denied'}>
                  {permission === 'denied' ? t('notify.blocked') : t('notify.enable')}
                </Button>
              </div>
              <p className="pr:mt-2 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
                {permission === 'denied' ? t('notify.allowInBrowser') : t('notify.tabOnly')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
