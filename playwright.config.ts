import { defineConfig, devices } from '@playwright/test'

/**
 * The browser tests run against the production bundle served by `bin/pr-radar.js`
 * -- the same file `npx pr-radar` installs -- rather than against the dev server.
 * Two of the bugs this project has shipped were invisible to a dev server and to
 * unit tests both: an empty `<img src>` React warns about, and the CORS failure
 * that made the entire GraphQL data layer unusable in a browser.
 */
// Deliberately not 4173. That is the port the application documents and the one
// a developer is most likely to have something else already sitting on.
const PORT = 41730

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && node bin/pr-radar.js --no-open --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse. A server already listening here is not this build, and a
    // suite that quietly tests a stale bundle is worse than one that fails:
    // eight of these tests once passed green against a running container
    // serving the previous commit. If the port is busy, failing loudly is the
    // correct outcome.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
