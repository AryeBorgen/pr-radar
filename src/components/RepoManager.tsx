import { useState } from 'react'
import type { RepoRef } from '../types'
import { fetchOwnerRepos, fetchViewerOrgs, suggestOwners } from '../lib/github'
import { parseRepoInput, repoKey } from '../lib/storage'

interface Props {
  token: string
  repos: RepoRef[]
  onChange: (repos: RepoRef[]) => void
}

export default function RepoManager({ token, repos, onChange }: Props) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
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
    setSuggestions([])

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
        if (found.repos.length > 0) {
          merge(found.repos)
          setInput('')
          setSuggestions([])
        } else {
          // An empty result is honest and useless on its own. Say which of the
          // two things was actually found, since "no repositories" reads as a
          // permissions problem and is usually a typed name that belongs to
          // somebody else -- and offer the organisations that do exist.
          setError(
            found.kind === 'user'
              ? `"${raw}" is a GitHub user, not an organisation, and has no repositories this token can see.`
              : `The organisation "${raw}" has no repositories this token can see.`,
          )
          setSuggestions(await fetchViewerOrgs(token).then((orgs) => suggestOwners(raw, orgs)).catch(() => []))
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Lookup failed.')
        setSuggestions([])
      } finally {
        setBusy(false)
      }
      return
    }

    setSuggestions([])
    setError('Enter owner/repo, a GitHub URL, or an organisation name.')
  }

  return (
    <div className="pr:border-b pr:border-neutral-200 pr:bg-neutral-50 pr:px-4 pr:py-4 pr:dark:border-neutral-800 pr:dark:bg-neutral-900">
      <form onSubmit={add} className="pr:flex pr:flex-wrap pr:gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="owner/repo, a GitHub URL, or an org name to add all its repos"
          aria-label="Add a repository"
          className="pr:min-w-64 pr:flex-1 pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-1.5 pr:text-sm pr:text-neutral-900 pr:outline-none pr:focus:border-blue-500 pr:dark:border-neutral-700 pr:dark:bg-neutral-950 pr:dark:text-neutral-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-1.5 pr:text-sm pr:font-medium pr:text-neutral-800 pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:border-neutral-700 pr:dark:bg-neutral-800 pr:dark:text-neutral-100 pr:dark:hover:bg-neutral-700"
        >
          {busy ? 'Looking up…' : 'Add'}
        </button>
      </form>

      {error && <p className="pr:mt-2 pr:text-sm pr:text-red-600 pr:dark:text-red-400">{error}</p>}

      {suggestions.length > 0 && (
        <p className="pr:mt-1.5 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          Did you mean{' '}
          {suggestions.map((name, index) => (
            <span key={name}>
              {index > 0 && (index === suggestions.length - 1 ? ' or ' : ', ')}
              <button
                type="button"
                onClick={() => {
                  setInput(name)
                  setError('')
                  setSuggestions([])
                }}
                className="pr:font-medium pr:text-blue-600 pr:underline pr:hover:text-blue-700 pr:dark:text-blue-400"
              >
                {name}
              </button>
            </span>
          ))}
          ?
        </p>
      )}

      {repos.length > 0 && (
        <ul className="pr:mt-3 pr:flex pr:flex-wrap pr:gap-1.5">
          {repos.map((ref) => (
            <li key={repoKey(ref)}>
              <span className="pr:flex pr:items-center pr:gap-1 pr:rounded-full pr:border pr:border-neutral-300 pr:bg-white pr:py-0.5 pr:pr-1 pr:pl-2.5 pr:text-xs pr:text-neutral-700 pr:dark:border-neutral-700 pr:dark:bg-neutral-950 pr:dark:text-neutral-300">
                {ref.owner}/{ref.name}
                <button
                  type="button"
                  onClick={() => onChange(repos.filter((r) => repoKey(r) !== repoKey(ref)))}
                  aria-label={`Remove ${ref.owner}/${ref.name}`}
                  className="pr:rounded-full pr:px-1 pr:text-neutral-400 pr:hover:bg-neutral-200 pr:hover:text-neutral-800 pr:dark:hover:bg-neutral-700 pr:dark:hover:text-neutral-100"
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
