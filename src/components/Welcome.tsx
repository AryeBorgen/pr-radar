import { T } from '../i18n/T'
import { useT } from '../i18n/useLocale'

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
  const t = useT()
  const LINK = 'pr:text-blue-600 pr:underline pr:dark:text-blue-400'
  const BOLD = 'pr:font-semibold'
  const CODE = 'pr:font-mono'
  const STEP = 'pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100'

  return (
    <div className="pr:mx-auto pr:max-w-lg pr:px-4 pr:py-16">
      <h1 className="pr:text-2xl pr:font-semibold pr:text-neutral-900 pr:dark:text-neutral-100">
        {t('app.name')}
      </h1>
      <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
        {t('app.tagline')}
      </p>

      <p className="pr:mt-6 pr:text-sm pr:text-neutral-700 pr:dark:text-neutral-300">
        <T k="welcome.pitch" parts={{ 1: <strong className={BOLD} /> }} />
      </p>

      <div className="pr:mt-8 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-neutral-50 pr:p-4 pr:dark:border-neutral-800 pr:dark:bg-neutral-900">
        <h2 className="pr:text-sm pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">
          {t('welcome.whyToken')}
        </h2>
        <p className="pr:mt-2 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          <T k="welcome.noServer" parts={{ 1: <strong className={BOLD} />, 2: <code className={CODE} /> }} />
        </p>
        <ul className="pr:mt-3 pr:space-y-1 pr:text-sm pr:text-neutral-600 pr:dark:text-neutral-400">
          <li>· <T k="welcome.pointTabOnly" parts={{ 1: <strong className={BOLD} /> }} /></li>
          <li>· {t('welcome.pointGitHubOnly')}</li>
          <li>· {t('welcome.pointPublic')}</li>
        </ul>
      </div>

      <ol className="pr:mt-8 pr:space-y-3 pr:text-sm pr:text-neutral-700 pr:dark:text-neutral-300">
        <li>
          <span className={STEP}>1.</span>{' '}
          <T
            k="welcome.step1"
            parts={{
              1: <a href={TOKEN_URL} target="_blank" rel="noreferrer" className={LINK} />,
              2: <span className="pr:font-medium" />,
            }}
          />
        </li>
        <li>
          <span className={STEP}>2.</span> {t('welcome.step2')}
        </li>
        <li>
          <span className={STEP}>3.</span>{' '}
          <T k="welcome.step3" parts={{ 1: <code className={CODE} />, 2: <code className={CODE} /> }} />
        </li>
      </ol>

      <button
        type="button"
        onClick={onContinue}
        className="pr:mt-8 pr:w-full pr:rounded-md pr:bg-emerald-600 pr:px-4 pr:py-2 pr:text-sm pr:font-medium pr:text-white pr:transition-colors pr:hover:bg-emerald-700"
      >
        {t('welcome.continue')}
      </button>

      <p className="pr:mt-4 pr:text-center pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
        <T
          k="welcome.source"
          parts={{
            1: (
              <a
                href="https://github.com/AryeBorgen/pr-radar"
                target="_blank"
                rel="noreferrer"
                className="pr:underline pr:hover:text-neutral-700 pr:dark:hover:text-neutral-300"
              />
            ),
          }}
        />
      </p>
    </div>
  )
}
