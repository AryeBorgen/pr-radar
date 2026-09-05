import { expect, test } from '@playwright/test'
import { mockGitHub } from './fixtures/github'

/**
 * The library, mounted the way a host would mount it.
 *
 * A plain page with no React of its own, because reaching hosts that are not
 * React is the entire argument for an imperative function over a component. If
 * that does not work, the design was wrong.
 */

/*
 * The import map is not optional and is worth seeing here rather than reading
 * about. The library leaves React to the host -- bundling it would put two
 * copies of React in one page, which is the classic way to make hooks throw --
 * so the built module imports `react` as a bare specifier. A page with a bundler
 * resolves that already; a plain page needs to be told where React is.
 */
const page = (script: string) => `
<!doctype html>
<html><head>
  <link rel="stylesheet" href="/style.css">
  <script type="importmap">
    {"imports": {
      "react": "https://esm.sh/react@19",
      "react-dom/client": "https://esm.sh/react-dom@19/client",
      "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime"
    }}
  </script>
</head>
<body>
  <h1 class="flex">A host with its own .flex</h1>
  <style>.flex { display: block; color: rgb(1, 2, 3) }</style>
  <div id="radar"></div>
  <script type="module">${script}</script>
</body></html>`

/**
 * `setContent` leaves the page on a blank origin, where `/render.js` cannot be
 * resolved at all. Serving the host page from a real URL is what makes the
 * import a genuine module load rather than a rehearsal of one.
 */
async function serve(p: import('@playwright/test').Page, html: string) {
  await p.route('**/host.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await p.goto('http://127.0.0.1:41730/host.html')
}

/*
 * Which build to mount. `dist-lib` is this working tree's; setting PR_RADAR_LIB
 * points the same four tests at a copy installed from the registry, which is how
 * `scripts/published-smoke.sh` asks whether what we shipped actually works. A
 * working tree is not a release, and the tests are the same either way on
 * purpose -- a separate suite for the published package would drift.
 */
const LIB = process.env.PR_RADAR_LIB ?? 'dist-lib'

test.describe('embedded in a page that is not React', () => {
  test.beforeEach(async ({ page: p }) => {
    await mockGitHub(p)
    // Serve the built library and stylesheet from the page's own origin, so the
    // import is a real module load rather than a bundler illusion.
    await p.route('**/render.js', (route) =>
      route.fulfill({ path: `${LIB}/render.js`, contentType: 'text/javascript' }),
    )
    await p.route('**/style.css', (route) =>
      route.fulfill({ path: `${LIB}/pr-radar.css`, contentType: 'text/css' }),
    )
  })

  test('renders the dashboard into an element', async ({ page: p }) => {
    await serve(p,
      page(`
        import { renderRadar } from '/render.js'
        window.handle = renderRadar(document.getElementById('radar'), {
          token: 'ghp_x', repos: [{ owner: 'acme', name: 'web' }],
        })
      `),
    )
    await expect(p.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()
  })

  test('leaves the host stylesheet alone, and is left alone by it', async ({ page: p }) => {
    // The prefix exists for this. Unprefixed, our `.flex` and the host's would be
    // the same selector and one of them would lose.
    await serve(p,
      page(`
        import { renderRadar } from '/render.js'
        renderRadar(document.getElementById('radar'), {
          token: 'ghp_x', repos: [{ owner: 'acme', name: 'web' }],
        })
      `),
    )
    await expect(p.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()

    const host = await p.locator('h1.flex').evaluate((el) => getComputedStyle(el).display)
    expect(host, "the host's own .flex must still be block").toBe('block')
  })

  test('destroy empties the element and stops the polling', async ({ page: p }) => {
    let requests = 0
    await p.route('https://api.github.com/repos/**', async (route) => {
      requests++
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await serve(p,
      page(`
        import { renderRadar } from '/render.js'
        window.handle = renderRadar(document.getElementById('radar'), {
          token: 'ghp_x', repos: [{ owner: 'acme', name: 'web' }], refreshInterval: 1,
        })
      `),
    )
    await expect(p.locator('#radar')).not.toBeEmpty()

    await p.evaluate(() => (window as never as { handle: { destroy(): void } }).handle.destroy())
    await expect(p.locator('#radar')).toBeEmpty()

    // A poll that outlives the element is the failure this is here to catch: it
    // is invisible until a tab has been open an hour making a request a second.
    const after = requests
    await p.waitForTimeout(2500)
    expect(requests, 'no request may be made after destroy').toBe(after)
  })

  test('setRepos changes the list without remounting', async ({ page: p }) => {
    await serve(p,
      page(`
        import { renderRadar } from '/render.js'
        window.handle = renderRadar(document.getElementById('radar'), {
          token: 'ghp_x', repos: [],
        })
      `),
    )
    await p.evaluate(() =>
      (window as never as { handle: { setRepos(r: unknown[]): void } }).handle.setRepos([
        { owner: 'acme', name: 'web' },
      ]),
    )
    await expect(p.getByText('Add a keyboard shortcut for the filter box')).toBeVisible()
  })
})

test.describe('wearing the host\'s design', () => {
  // Its own, because this block sits outside the one above and inherited none
  // of its routes -- which is why every test here failed on a page that never
  // loaded the library at all.
  test.beforeEach(async ({ page: p }) => {
    await mockGitHub(p)
    await p.route('**/render.js', (route) =>
      route.fulfill({ path: `${LIB}/render.js`, contentType: 'text/javascript' }),
    )
    await p.route('**/style.css', (route) =>
      route.fulfill({ path: `${LIB}/pr-radar.css`, contentType: 'text/css' }),
    )
  })

  /*
   * The feature is only real if a host's component actually renders. These
   * mount the radar with replacements and look for them on the page, rather
   * than for the option having been accepted.
   */
  const withComponents = (body: string) => `
    import { renderRadar } from '/render.js'
    import { createElement as h } from 'react'
    ${body}
  `

  test('a replaced button is the one that renders', async ({ page: p }) => {
    await serve(
      p,
      page(
        withComponents(`
          const Button = ({ children, onClick, variant }) =>
            h('button', { onClick, 'data-host-button': variant, className: 'host-btn' }, children)
          renderRadar(document.getElementById('radar'), {
            token: 'ghp_test',
            repos: [{ owner: 'acme', name: 'web' }],
            components: { Button },
          })
        `),
      ),
    )

    await expect(p.locator('[data-host-button]').first()).toBeVisible()
    // And the radar's own is gone from the places it was used.
    expect(await p.locator('.host-btn').count()).toBeGreaterThan(0)
  })

  test('a replaced row arranges the parts the radar hands it', async ({ page: p }) => {
    await serve(
      p,
      page(
        withComponents(`
          const Row = ({ title, meta, badges, state, draft }) =>
            h('article', { 'data-host-row': state, 'data-draft': String(draft) }, [
              h('h3', { key: 't' }, title),
              h('div', { key: 'b' }, badges),
              h('footer', { key: 'm' }, meta),
            ])
          renderRadar(document.getElementById('radar'), {
            token: 'ghp_test',
            repos: [{ owner: 'acme', name: 'web' }],
            components: { Row },
          })
        `),
      ),
    )

    const rows = p.locator('[data-host-row]')
    await expect(rows.first()).toBeVisible()
    // The pieces arrive rendered, and the row's own facts arrive as strings.
    await expect(rows.first().locator('h3')).toContainText('Add a keyboard shortcut')
    await expect(rows.first()).toHaveAttribute('data-host-row', 'open')
    await expect(p.locator('[data-draft="true"]')).toHaveCount(1)
  })

  // Partial on purpose: replacing a button must not make a host responsible for
  // a row as well.
  test('what is not replaced keeps the radar\'s own', async ({ page: p }) => {
    await serve(
      p,
      page(
        withComponents(`
          const Button = ({ children, onClick }) => h('button', { onClick, id: 'only-button' }, children)
          renderRadar(document.getElementById('radar'), {
            token: 'ghp_test',
            repos: [{ owner: 'acme', name: 'web' }],
            components: { Button },
          })
        `),
      ),
    )

    await expect(p.locator('#only-button').first()).toBeVisible()
    // The radar's own list rows are still there.
    await expect(p.locator('li').first()).toBeVisible()
  })

  test('no pull request reaches a host component', async ({ page: p }) => {
    await serve(
      p,
      page(
        withComponents(`
          window.seen = []
          const Row = (props) => {
            window.seen.push(Object.keys(props).sort().join(','))
            // With content: an empty element has no height, and Playwright
            // correctly reports a zero-height element as hidden.
            return h('div', { 'data-row': true }, props.title)
          }
          renderRadar(document.getElementById('radar'), {
            token: 'ghp_test',
            repos: [{ owner: 'acme', name: 'web' }],
            components: { Row },
          })
        `),
      ),
    )

    await expect(p.locator('[data-row]').first()).toBeVisible()
    const keys = await p.evaluate(() => (window as unknown as { seen: string[] }).seen[0])

    /*
     * The discipline the whole surface rests on. A slot that received the pull
     * request would publish `PullRequest`, and that is the type the
     * architecture depends on being free to change -- it is what changed when
     * the data layer moved from GraphQL to REST in one module.
     */
    expect(keys).toBe('actions,badges,draft,icon,meta,state,title,trailing')
  })
})

