import { useDeviceLogin } from '../lib/useDeviceLogin'
import { useSlots } from './slots'
import type { AuthFailure } from '../lib/deviceAuth'
import { useT } from '../i18n/useLocale'
import type { MessageKey } from '../i18n/en'

/**
 * Signing in with a GitHub account, where the deployment can relay it.
 *
 * GitHub's OAuth endpoints send no CORS headers, so a page cannot run this
 * alone -- measured on every run in tests/reachability.spec.ts. Where the app is
 * served by `npx pr-radar` or the container, those two requests go through a
 * same-origin relay on the user's own machine. Where it is served by a static
 * host there is nothing to relay through, `/auth/config` says so, and this
 * component is not rendered at all.
 */

/**
 * What to say when it fails. Separated from the reason so that a failure the
 * user caused reads differently from one they did not: "you cancelled" and
 * "GitHub is unreachable" deserve different offers.
 */
const MESSAGES: Record<AuthFailure, MessageKey> = {
  denied: 'signIn.failed.denied',
  expired: 'signIn.failed.expired',
  unsupported: 'signIn.failed.unsupported',
  network: 'signIn.failed.network',
  unknown: 'signIn.failed.unknown',
}

export default function SignIn({ onToken }: { onToken: (token: string) => void }) {
  const { Button, Link } = useSlots()
  const t = useT()
  const { state, start, cancel } = useDeviceLogin(onToken)

  if (state.status === 'waiting') {
    return (
      <div className="pr:rounded-md pr:border pr:border-neutral-200 pr:bg-neutral-50 pr:p-4 pr:dark:border-neutral-800 pr:dark:bg-neutral-900">
        <p className="pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          {t('signIn.enterCodeAt')}{' '}
          <Link href={state.code.verificationUri} variant="default" external>
            {state.code.verificationUri.replace(/^https:\/\//, '')}
          </Link>
        </p>
        {/* Letter-spaced and monospaced because it is read aloud off a screen
            and typed into another device as often as it is copied. */}
        <p
          data-testid="user-code"
          className="pr:mt-3 pr:font-mono pr:text-2xl pr:tracking-[0.3em] pr:text-neutral-900 pr:dark:text-neutral-100"
        >
          {state.code.userCode}
        </p>
        <p className="pr:mt-3 pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-500">
          {t('signIn.waiting')}
        </p>
        <div className="pr:mt-3">
          <Button variant="quiet" onClick={cancel}>
            {t('signIn.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="pr:[&>button]:w-full">
        <Button variant="primary" onClick={start} disabled={state.status === 'starting'}>
          {state.status === 'starting' ? t('gate.signInStarting') : t('gate.signIn')}
        </Button>
      </div>
      {state.status === 'failed' && (
        <p role="alert" className="pr:mt-2 pr:text-sm pr:text-red-600 pr:dark:text-red-400">
          {t(MESSAGES[state.reason])}
        </p>
      )}
    </div>
  )
}
