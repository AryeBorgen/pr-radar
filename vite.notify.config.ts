import { defineConfig } from 'vite'

/**
 * The push server, built for Node.
 *
 * A third configuration rather than a second entry in `vite.lib.config.ts`, and
 * that is deliberate. Adding an entry there makes Rollup split whatever the two
 * share into its own chunk, which changes the shape of `dist-lib/` -- the
 * directory the `exports` map points at and that `surface.spec.ts` pins byte for
 * byte. A build for a server has no business moving the published library
 * around, so it gets its own directory and leaves that one untouched.
 *
 * No React plugin and no Tailwind here: if either were ever needed, something
 * has been imported that a server should not be importing, and the build should
 * fail rather than quietly pull a UI into a daemon.
 */
export default defineConfig({
  build: {
    outDir: 'dist-server',
    emptyOutDir: true,
    // Node, not a browser: `fetch` is global from 18, and nothing here needs a
    // transform for older syntax.
    target: 'node20',
    // A daemon is read in a stack trace far more often than it is downloaded.
    minify: false,
    lib: {
      entry: 'src/server/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Nothing should reach for these. Listing them makes an accidental import
      // fail loudly at build time instead of at three in the morning.
      external: [/^node:/, 'react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
