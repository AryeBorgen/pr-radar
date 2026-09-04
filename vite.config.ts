import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Link previews need an absolute URL -- a social network resolving `/social.png`
// against its own domain gets nothing. `base` cannot help, so the origin is its
// own setting, defaulting to where the project is published.
const SITE = (process.env.PR_RADAR_SITE ?? 'https://aryeborgen.github.io/pr-radar').replace(/\/$/, '')

/** Substitutes %PR_RADAR_SITE% in index.html at build time. */
function siteUrl() {
  return {
    name: 'pr-radar-site-url',
    transformIndexHtml: (html: string) => html.replaceAll('%PR_RADAR_SITE%', SITE),
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
