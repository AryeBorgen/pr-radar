import { useState } from 'react'
import type { RepoRef } from '../types'
import { fetchOwnerRepos } from '../lib/github'
import { parseRepoInput, repoKey } from '../lib/storage'

interface Props {
  token: string
  repos: RepoRef[]
  onChange: (repos: RepoRef[]) => void
}

export default function RepoManager({ token, repos, onChange }: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  /** Union by lowercased slug, so the same repo cannot be added twice. */
  function merge(additions: RepoRef[]) {
    const seen = new Map(repos.map((ref) => [repoKey(ref), ref]))
    for (const ref of additions) {
      if (!seen.has(repoKey(ref))) seen.set(repoKey(ref), ref)
    }
    onChange([...seen.values()])
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const raw = input.trim()
    if (!raw) return
    setError('')

    const single = parseRepoInput(raw)
    if (single) {
      merge([single])
      setInput('')
      return
    }

    // No slash: treat it as a user or organisation and expand it.
    if (/^[A-Za-z0-9-]+$/.test(raw)) {
      setBusy(true)
      try {
        const found = await fetchOwnerRepos(token, raw)
        if (found.length === 0) {
          setError(`"${raw}" has no repositories this token can see.`)
        } else {
          merge(found)
          setInput('')
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Lookup failed.')
      } finally {
        setBusy(false)
      }
      return
    }

    setError('Enter owner/repo, a GitHub URL, or an organisation name.')
  }

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="owner/repo, a GitHub URL, or an org name to add all its repos"
          aria-label="Add a repository"
          className="min-w-64 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          {busy ? 'Looking up…' : 'Add'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {repos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {repos.map((ref) => (
            <li key={repoKey(ref)}>
              <span className="flex items-center gap-1 rounded-full border border-neutral-300 bg-white py-0.5 pr-1 pl-2.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                {ref.owner}/{ref.name}
                <button
                  type="button"
                  onClick={() => onChange(repos.filter((r) => repoKey(r) !== repoKey(ref)))}
                  aria-label={`Remove ${ref.owner}/${ref.name}`}
                  className="rounded-full px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
