import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePrRadar } from './lib/usePrRadar'
import Radar from './components/Radar'
import { LocaleProvider } from './i18n/useLocale'
// `.js`, not `./types`, and deliberately: a consumer on `moduleResolution:
// nodenext` cannot resolve an extensionless relative import in a `.d.ts`, and
// tsc emits the specifier exactly as written. Type-only, so nothing reaches the
// bundle. Pinned by tests/surface.spec.ts.
import type { RepoRef } from './types.js'
import type { Locale } from './i18n/types.js'

export type { RepoRef, Locale }

export interface RadarOptions {
  /** A GitHub token. It is used and never stored: see the note in `renderRadar`. */
  token: string
  repos: RepoRef[]
  /** Seconds between background refetches. 0 disables polling. Defaults to 120. */
  refreshInterval?: number
  /**
   * Which language to render in. Defaults to the reader's browser preference.
   * The host almost always knows better than the radar does what the page
   * around it is written in, and Hebrew brings right-to-left with it.
   */
  locale?: Locale
}

export interface RadarHandle {
  /** Change which repositories are shown, without remounting. */
  setRepos(repos: RepoRef[]): void
  /** Unmount and release everything. Not optional -- see below. */
  destroy(): void
}

function Mounted({ options }: { options: RadarOptions }) {
  const radar = usePrRadar(options)
  return <Radar radar={radar} />
}

/**
 * Render the dashboard into an element.
 *
 * Imperative on purpose. A React host could take a component, but Vue, Angular
 * and a plain HTML page cannot, and a function reaches all of them -- which is
 * why there is no web component here and no plan for one.
 *
 * **Nothing is stored.** The standalone page keeps a token in sessionStorage and
 * settings in localStorage; this does neither. A host has its own idea of who
 * the user is, and a widget that writes to storage in a page you did not write
 * is a widget you cannot reason about.
 *
 * The options are an object rather than positional arguments because of a
 * feature that does not exist yet: supplying your own components, so the radar
 * adopts your design instead of bringing its own. As a new optional key that is
 * a minor release; as a third parameter it is a signature that gets worse with
 * every addition.
 */
export function renderRadar(element: Element, options: RadarOptions): RadarHandle {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Refetching on every window focus burns rate limit for no benefit when
        // the poll interval already covers it.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  })

  const root: Root = createRoot(element)
  let current = options

  const draw = () =>
    root.render(
      <StrictMode>
        {/*
         * `applyToDocument` is off: the document belongs to the host. The radar
         * puts `dir` on its own root instead, so a Hebrew panel reads correctly
         * without re-laying-out an English page around it. Nothing is stored
         * either, for the same reason nothing else here is.
         */}
        <LocaleProvider applyToDocument={false} {...(current.locale === undefined ? {} : { initial: current.locale })}>
          <QueryClientProvider client={client}>
            <Mounted options={current} />
          </QueryClientProvider>
        </LocaleProvider>
      </StrictMode>,
    )

  draw()

  return {
    setRepos(repos) {
      current = { ...current, repos }
      draw()
    },
    /*
     * Unmounting the root is half of it. The query client holds a polling timer
     * and a cache that would otherwise outlive the element, so a host that
     * mounts and unmounts a route repeatedly would accumulate one of each per
     * visit -- invisible until a tab has been open an hour and is making a
     * request a second.
     */
    destroy() {
      root.unmount()
      client.getQueryCache().clear()
      client.clear()
    },
  }
}
