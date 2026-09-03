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
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">PR Radar</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Every open pull request across all your repositories, on one screen.
      </p>

      <form onSubmit={submit} className="mt-8">
        <label
          htmlFor="token"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
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
          className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {checking ? 'Verifying…' : 'Continue'}
        </button>
      </form>

      <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        <p>
          <a href={SCOPE_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">
            Create a token
          </a>{' '}
          with <code className="font-mono">repo</code> (private repositories) and{' '}
          <code className="font-mono">read:org</code> (to expand an organisation into its repos).
          Public repositories alone need no scopes at all.
        </p>
        <p className="mt-3">
          The token is kept in this tab's <code className="font-mono">sessionStorage</code> and is
          sent only to <code className="font-mono">api.github.com</code>. This page has no server:
          nothing you enter leaves your browser except to GitHub itself.
        </p>
      </div>
    </div>
  )
}
