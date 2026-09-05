import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Link previews need an absolute URL -- a social network resolving `/social.png`
// against its own domain gets nothing. `base` cannot help, so the origin is its
// own setting, defaulting to where the project is published.
const SITE = (process.env.PR_RADAR_SITE ?? 'https://aryeborgen.github.io/pr-radar').replace(/\/$/, '')

/*
 * Where the sign-in relay lives, for a build that will be served by something
 * that cannot relay for itself. Empty for `npx pr-radar` and the container,
 * which relay from the same origin.
 */
const RELAY = (process.env.PR_RADAR_RELAY ?? '').replace(/\/$/, '')

/**
 * Substitutes %PR_RADAR_SITE% in index.html, and adds the relay to the policy.
 *
 * `connect-src` names api.github.com and nothing else, deliberately: it is what
 * stops a compromised dependency posting the token anywhere. A relay on another
 * origin therefore has to be named, and named exactly -- the browser blocks it
 * silently otherwise, which looks like the relay being down.
 */
function siteUrl() {
  return {
    name: 'pr-radar-site-url',
    transformIndexHtml: (html: string) =>
      html
        .replaceAll('%PR_RADAR_SITE%', SITE)
        .replace('connect-src \'self\' https://api.github.com', RELAY
          ? `connect-src 'self' https://api.github.com ${RELAY}`
          : "connect-src 'self' https://api.github.com"),
  }
}

// `base` is overridable so the same build works on GitHub Pages (served from
// /<repo>/) and on any other static host (served from /).
export default defineConfig({
  base: process.env.PR_RADAR_BASE ?? '/',
  plugins: [react(), tailwindcss(), siteUrl()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    globals: true,
    // Vitest's default pattern would also collect tests/*.spec.ts, which are
    // Playwright specs and cannot run under it. Naming the source tree keeps the
    // two suites from colliding: `npm test` is the unit tests, `npm run
    // test:browser` is the browser ones.
    // `.tsx` too. It was `.ts` alone, and a test file with a component in it
    // was collected by nothing: ten tests sat in the tree, passing by never
    // running. A suite that quietly skips a file is worse than one that fails.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
  },
})
