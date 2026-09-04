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
    <div className="pr:mx-auto pr:max-w-lg pr:px-4 pr:py-16">
      <h1 className="pr:text-2xl pr:font-semibold pr:text-neutral-900 pr:dark:text-neutral-100">PR Radar</h1>
      <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
        Every open pull request across all your repositories, on one screen.
      </p>

      <p className="pr:mt-6 pr:text-sm pr:text-neutral-700 pr:dark:text-neutral-300">
        GitHub can already list pull requests. What it cannot do is tell you, across every
        repository at once, which ones are actually waiting on{' '}
        <strong className="pr:font-semibold">you</strong>. That is what this is for. Clicking one takes
        you to it on GitHub — this is where you notice things, not where you do them.
      </p>

      <div className="pr:mt-8 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-neutral-50 pr:p-4 pr:dark:border-neutral-800 pr:dark:bg-neutral-900">
        <h2 className="pr:text-sm pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">
          Why it asks for a token
        </h2>
        <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          There is <strong className="pr:font-semibold">no server</strong> behind this page. It runs
          entirely in your browser and talks to <code className="pr:font-mono">api.github.com</code>{' '}
          directly, so it needs your own credentials to read anything. There is no account to
          create, because there is nothing to create it on.
        </p>
        <ul className="pr:mt-3 pr:space-y-1 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          <li>
            · The token is kept in this tab only, and is{' '}
            <strong className="pr:font-semibold">gone when you close it</strong>.
          </li>
          <li>· It is sent to GitHub and to nowhere else. The page enforces that, not just promises it.</li>
          <li>· Watching only public repositories? It needs no permissions at all.</li>
        </ul>
      </div>

      <ol className="pr:mt-8 pr:space-y-3 pr:text-sm pr:text-neutral-700 pr:dark:text-neutral-300">
        <li>
          <span className="pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">1.</span>{' '}
          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="pr:text-blue-600 pr:underline pr:dark:text-blue-400"
          >
            Create a token
          </a>{' '}
          — that link fills in everything. Scroll down and press{' '}
          <span className="pr:font-medium">Generate token</span>.
        </li>
        <li>
          <span className="pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">2.</span> Paste it on
          the next screen.
        </li>
        <li>
          <span className="pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">3.</span> Add a
          repository — <code className="pr:font-mono">facebook/react</code>, or just{' '}
          <code className="pr:font-mono">facebook</code> for a whole organisation.
        </li>
      </ol>

      <button
        type="button"
        onClick={onContinue}
        className="pr:mt-8 pr:w-full pr:rounded-md pr:bg-emerald-600 pr:px-4 pr:py-2 pr:text-sm pr:font-medium pr:text-white pr:transition-colors pr:hover:bg-emerald-700"
      >
        Continue to the radar
      </button>

      <p className="pr:mt-4 pr:text-center pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
        <a
          href="https://github.com/AryeBorgen/pr-radar"
          target="_blank"
          rel="noreferrer"
          className="pr:underline pr:hover:text-neutral-700 pr:dark:hover:text-neutral-300"
        >
          Read the source
        </a>{' '}
        — it is the whole of the application.
      </p>
    </div>
  )
}
