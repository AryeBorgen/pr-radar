import { useState } from 'react'
import type { Credential } from '../lib/deviceAuth'
import { useSlots } from './slots'
import { messageFor } from '../i18n/errors'
import { fetchViewer } from '../lib/github'
import { useDeviceLoginAvailable } from '../lib/useDeviceLogin'
import SignIn from './SignIn'
import { T } from '../i18n/T'
import { useT } from '../i18n/useLocale'

const SCOPE_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar'

/**
 * Two ways in, and which ones exist depends on where this is being served from.
 *
 * GitHub's OAuth endpoints send no CORS headers, so a page cannot sign in by
 * itself. Where something is serving this that can relay those two requests --
 * `npx pr-radar`, or the container -- there is a "Sign in with GitHub" button
 * above the token field. Where it is served by a static host there is nothing to
 * relay through, and the token is the only way in.
 *
 * The token field never goes away. It needs no GitHub App configured anywhere,
 * it works on every deployment, and some people would simply rather paste one.
 */
export default function TokenGate({ onToken }: { onToken: (credential: Credential) => void }) {
  const { Button, Input, Link } = useSlots()
  const t = useT()
  const canSignIn = useDeviceLoginAvailable()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const token = value.trim()
    if (!token) return

    setChecking(true)
    setError('')
    try {
      await fetchViewer(token)
      // A pasted token has no refresh token and no expiry, which is exactly
      // what a session with neither looks like. Same path, not a special case.
      onToken({ token })
    } catch (cause) {
      setError(messageFor(t, cause, 'gate.tokenUnverified'))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="pr:mx-auto pr:max-w-lg pr:px-4 pr:py-16">
      <h1 className="pr:text-2xl pr:font-semibold pr:text-neutral-900 pr:dark:text-neutral-100">
        {t('app.name')}
      </h1>
      <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
        {t('app.tagline')}
      </p>

      {canSignIn === true && (
        <div className="pr:mt-8">
          <SignIn onToken={onToken} />
          <div className="pr:my-6 pr:flex pr:items-center pr:gap-3 pr:text-xs pr:text-neutral-400 pr:dark:text-neutral-600">
            <span className="pr:h-px pr:flex-1 pr:bg-neutral-200 pr:dark:bg-neutral-800" />
            {t('gate.or')}
            <span className="pr:h-px pr:flex-1 pr:bg-neutral-200 pr:dark:bg-neutral-800" />
          </div>
        </div>
      )}

      <form onSubmit={submit} className={canSignIn === true ? '' : 'pr:mt-8'}>
        <label
          htmlFor="token"
          className="pr:block pr:text-sm pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100"
        >
          {t('gate.tokenLabel')}
        </label>
        <div className="pr:mt-2">
          <Input
            id="token"
            type="password"
            autoComplete="off"
            value={value}
            onChange={setValue}
            placeholder={t('gate.tokenPlaceholder')}
          />
        </div>
        {error && <p className="pr:mt-2 pr:text-sm pr:text-red-600 pr:dark:text-red-400">{error}</p>}
        <div className="pr:mt-4">
          <Button variant="primary" type="submit" disabled={checking || !value.trim()}>
            {checking ? t('gate.verifying') : t('gate.continue')}
          </Button>
        </div>
      </form>

      <div className="pr:mt-8 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-neutral-50 pr:p-4 pr:text-sm pr:text-neutral-600 pr:dark:border-neutral-800 pr:dark:bg-neutral-900 pr:dark:text-neutral-400">
        <p>
          <Link href={SCOPE_URL} variant="default" external>
            {t('gate.createToken')}
          </Link>{' '}
          <T
            k="gate.scopes"
            parts={{ 1: <code className="pr:font-mono" />, 2: <code className="pr:font-mono" /> }}
          />
        </p>
        <p className="pr:mt-3">
          <T
            k="gate.storage"
            parts={{ 1: <code className="pr:font-mono" />, 2: <code className="pr:font-mono" /> }}
          />
        </p>
      </div>
    </div>
  )
}
