import { useDeviceLogin } from '../lib/useDeviceLogin'
import { useState } from 'react'
import { copyAndOpen, type CopyResult } from '../lib/clipboard'
import { useSlots } from './slots'
import type { AuthFailure, Credential } from '../lib/deviceAuth'
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

export default function SignIn({ onToken }: { onToken: (credential: Credential) => void }) {
  /** What the last copy did, or null before one has been tried. */
  const [copied, setCopied] = useState<CopyResult | null>(null)
  const { Button, Link } = useSlots()
  const t = useT()
  const { state, start, cancel } = useDeviceLogin(onToken)

  const copyAndGo = () => {
    if (state.status !== 'waiting') return
    // Not awaited before the tab opens -- see copyAndOpen for why that ordering
    // is the whole point.
    void copyAndOpen(state.code.userCode, state.code.verificationUri).then(setCopied)
  }

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
        {/*
          One press instead of two. Copying the code and then finding the link
          is a step people do out of order, or half of -- and on a phone,
          switching apps to paste it is where a sign-in gets abandoned.

          The code stays on screen above: the clipboard is refused often enough
          (an insecure origin, a denied permission, a browser that never had it)
          that a button which pretended otherwise would leave someone pasting
          whatever they had copied before.
        */}
        <div className="pr:mt-4 pr:[&>button]:w-full">
          <Button variant="primary" onClick={copyAndGo}>
            {t('signIn.copyAndGo')}
          </Button>
        </div>

        <p
          role="status"
          className="pr:mt-3 pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-500"
        >
          {copied === 'copied'
            ? t('signIn.copied')
            : copied === 'failed'
              ? t('signIn.copyFailed')
              : t('signIn.waiting')}
        </p>
        <div className="pr:mt-2">
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
