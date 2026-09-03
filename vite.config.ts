import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` is overridable so the same build works on GitHub Pages (served from
// /<repo>/) and on any other static host (served from /).
export default defineConfig({
  base: process.env.PR_RADAR_BASE ?? '/',
  plugins: [react(), tailwindcss()],
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
    environment: 'node',
    // Vitest's default pattern would also collect tests/*.spec.ts, which are
    // Playwright specs and cannot run under it. Naming the source tree keeps the
    // two suites from colliding: `npm test` is the unit tests, `npm run
    // test:browser` is the browser ones.
    include: ['src/**/*.test.ts'],
  },
})
