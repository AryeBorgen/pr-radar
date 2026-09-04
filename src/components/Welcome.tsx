const TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar'

/**
 * The first screen a stranger meets.
 *
 * What used to be here was the token field, with the explanation underneath it.
 * That is the wrong order: "why does this want a GitHub token" has to be
 * answered before it is asked, or the answer -- that it goes nowhere but GitHub,
 * because there is nowhere else for it to go -- arrives after the person has
 * already decided not to type anything.
 *
 * Shown once. The token lives in sessionStorage and is gone with the tab, so the
 * token screen is met every session; being introduced to the app every session
 * would be noise.
 */
export default function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">PR Radar</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Every open pull request across all your repositories, on one screen.
      </p>

      <p className="mt-6 text-sm text-neutral-700 dark:text-neutral-300">
        GitHub can already list pull requests. What it cannot do is tell you, across every
        repository at once, which ones are actually waiting on{' '}
        <strong className="font-semibold">you</strong>. That is what this is for. Clicking one takes
        you to it on GitHub — this is where you notice things, not where you do them.
      </p>

      <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Why it asks for a token
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          There is <strong className="font-semibold">no server</strong> behind this page. It runs
          entirely in your browser and talks to <code className="font-mono">api.github.com</code>{' '}
          directly, so it needs your own credentials to read anything. There is no account to
          create, because there is nothing to create it on.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            · The token is kept in this tab only, and is{' '}
            <strong className="font-semibold">gone when you close it</strong>.
          </li>
          <li>· It is sent to GitHub and to nowhere else. The page enforces that, not just promises it.</li>
          <li>· Watching only public repositories? It needs no permissions at all.</li>
        </ul>
      </div>

      <ol className="mt-8 space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
        <li>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">1.</span>{' '}
          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline dark:text-blue-400"
          >
            Create a token
          </a>{' '}
          — that link fills in everything. Scroll down and press{' '}
          <span className="font-medium">Generate token</span>.
        </li>
        <li>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">2.</span> Paste it on
          the next screen.
        </li>
        <li>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">3.</span> Add a
          repository — <code className="font-mono">facebook/react</code>, or just{' '}
          <code className="font-mono">facebook</code> for a whole organisation.
        </li>
      </ol>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
      >
        Continue to the radar
      </button>

      <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        <a
          href="https://github.com/AryeBorgen/pr-radar"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Read the source
        </a>{' '}
        — it is the whole of the application.
      </p>
    </div>
  )
}
