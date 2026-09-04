import { useState } from 'react'
import { fetchViewer } from '../lib/github'

const SCOPE_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar'

/**
 * There is no backend, so there is no OAuth: exchanging an OAuth code needs a
 * client secret, and GitHub's token endpoint sends no CORS headers, which rules
 * out doing it from the page. A token the user creates themselves keeps the
 * whole app deployable as static files with no secret to hold anywhere.
 */
export default function TokenGate({ onToken }: { onToken: (token: string) => void }) {
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
      onToken(token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify the token.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="pr:mx-auto pr:max-w-lg pr:px-4 pr:py-16">
      <h1 className="pr:text-2xl pr:font-semibold pr:text-neutral-900 pr:dark:text-neutral-100">PR Radar</h1>
      <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
        Every open pull request across all your repositories, on one screen.
      </p>

      <form onSubmit={submit} className="pr:mt-8">
        <label
          htmlFor="token"
          className="pr:block pr:text-sm pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100"
        >
          GitHub personal access token
        </label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="ghp_… or github_pat_…"
          className="pr:mt-2 pr:w-full pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-2 pr:text-sm pr:text-neutral-900 pr:outline-none pr:focus:border-blue-500 pr:dark:border-neutral-700 pr:dark:bg-neutral-900 pr:dark:text-neutral-100"
        />
        {error && <p className="pr:mt-2 pr:text-sm pr:text-red-600 pr:dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="pr:mt-4 pr:rounded-md pr:bg-emerald-600 pr:px-4 pr:py-2 pr:text-sm pr:font-medium pr:text-white pr:hover:bg-emerald-700 pr:disabled:opacity-50"
        >
          {checking ? 'Verifying…' : 'Continue'}
        </button>
      </form>

      <div className="pr:mt-8 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-neutral-50 pr:p-4 pr:text-sm pr:text-neutral-600 pr:dark:border-neutral-800 pr:dark:bg-neutral-900 pr:dark:text-neutral-400">
        <p>
          <a href={SCOPE_URL} target="_blank" rel="noreferrer" className="pr:text-blue-600 pr:underline pr:dark:text-blue-400">
            Create a token
          </a>{' '}
          with <code className="pr:font-mono">repo</code> (private repositories) and{' '}
          <code className="pr:font-mono">read:org</code> (to expand an organisation into its repos).
          Public repositories alone need no scopes at all.
        </p>
        <p className="pr:mt-3">
          The token is kept in this tab's <code className="pr:font-mono">sessionStorage</code> and is
          sent only to <code className="pr:font-mono">api.github.com</code>. This page has no server:
          nothing you enter leaves your browser except to GitHub itself.
        </p>
      </div>
    </div>
  )
}
