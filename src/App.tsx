import { useEffect, useState } from 'react'
import { usePrRadar } from './lib/usePrRadar'
import {
  DEFAULT_SETTINGS,
  introSeen,
  loadSettings,
  loadToken,
  markIntroSeen,
  saveSettings,
  saveToken,
} from './lib/storage'
import type { RepoRef, SavedView, Settings } from './types'
import { DEFAULT_NOTIFY_ENABLED } from './lib/notifications'
import { useNotifications } from './lib/useNotifications'
import Radar from './components/Radar'
import NotifyMenu from './components/NotifyMenu'
import RepoManager from './components/RepoManager'
import TokenGate from './components/TokenGate'
import Welcome from './components/Welcome'
import LanguageMenu from './components/LanguageMenu'
import { useT } from './i18n/useLocale'

/**
 * The standalone page. Everything here is what a hosted dashboard needs and an
 * embedded one does not: acquiring a token, remembering settings, choosing
 * repositories, signing out. The dashboard itself is `Radar`, and `renderRadar`
 * mounts that alone.
 */
export default function App() {
  const t = useT()
  const [token, setToken] = useState(loadToken)
  const [seenIntro, setSeenIntro] = useState(introSeen)
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : loadSettings(),
  )
  const [showRepos, setShowRepos] = useState(false)
  const [notify, setNotify] = useState<Record<string, boolean>>(DEFAULT_NOTIFY_ENABLED)

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveToken(token), [token])

  const radar = usePrRadar({
    token,
    repos: settings.repos,
    views: settings.views,
    refreshInterval: settings.refreshInterval,
  })

  // Watches the whole fetched list, not the filtered view: a notification you
  // only get when the right tab is selected is not a notification.
  useNotifications(radar.pullRequests, radar.viewer, notify, settings.repos.length > 0)

  const setRepos = (repos: RepoRef[]) => setSettings((prev) => ({ ...prev, repos }))
  const setViews = (views: SavedView[]) => setSettings((prev) => ({ ...prev, views }))

  if (!token) {
    // The introduction comes before the credential field, and only once. See
    // components/Welcome.tsx for why that order matters.
    if (!seenIntro) {
      return (
        <Welcome
          onContinue={() => {
            markIntroSeen()
            setSeenIntro(true)
          }}
        />
      )
    }
    return <TokenGate onToken={setToken} />
  }

  const noRepos = settings.repos.length === 0

  return (
    <div className="pr:min-h-screen pr:bg-white pr:text-neutral-900 pr:dark:bg-neutral-950 pr:dark:text-neutral-100">
      <header className="pr:flex pr:flex-wrap pr:items-center pr:gap-3 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-3 pr:dark:border-neutral-800">
        <h1 className="pr:font-semibold">{t('app.name')}</h1>
        <span className="pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-400">
          {t('header.repositories', { count: settings.repos.length })}
          {radar.viewer && ` · ${radar.viewer}`}
        </span>
        <div className="pr:ms-auto pr:flex pr:items-center pr:gap-2">
          <button
            type="button"
            onClick={() => setShowRepos((open) => !open)}
            className="pr:rounded-md pr:border pr:border-neutral-300 pr:px-2.5 pr:py-1 pr:text-sm pr:hover:bg-neutral-100 pr:dark:border-neutral-700 pr:dark:hover:bg-neutral-800"
          >
            {showRepos ? t('header.done') : t('header.manageRepositories')}
          </button>
          <NotifyMenu enabled={notify} onChange={setNotify} />
          <LanguageMenu />
          <button
            type="button"
            onClick={() => setToken('')}
            className="pr:text-sm pr:text-neutral-500 pr:hover:text-neutral-900 pr:dark:hover:text-neutral-100"
          >
            {t('header.signOut')}
          </button>
        </div>
      </header>

      {(showRepos || noRepos) && (
        <RepoManager token={token} repos={settings.repos} onChange={setRepos} />
      )}

      {noRepos ? (
        <p className="pr:px-4 pr:py-12 pr:text-center pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-400">
          {t('repos.empty')}
        </p>
      ) : (
        <Radar radar={radar} views={settings.views} onViewsChange={setViews} />
      )}
    </div>
  )
}
