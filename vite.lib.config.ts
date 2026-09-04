import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
 * The library build, separate from the application build.
 *
 * They cannot be one configuration: the application bundles React and ships a
 * page, while the library must leave React to the host -- two copies of React in
 * one page is the classic way to make hooks throw.
 *
 * Declarations come from `tsc` rather than a Vite plugin. vite-plugin-dts needs
 * TypeScript's JavaScript Compiler API, which TypeScript 7 removed, and would
 * have meant installing a compatibility package to get back something `tsc`
 * emits on its own.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  /*
   * React and react-query branch on `process.env.NODE_ENV`, a Node global that
   * does not exist in a page. The application build gets this from Vite for
   * free; a library build does not, and the bundle then throws
   * "process is not defined" the moment a host without a bundler loads it.
   * Caught by mounting it from a plain HTML page, which is what that test is for.
   */
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-lib',
    // public/ belongs to the page, not to the library. Without this the package
    // would ship a service worker and a web app manifest to every host that
    // embedded it, and a manifest in somebody else's page is a claim to be an
    // installable app that they did not make.
    copyPublicDir: false,
    lib: {
      entry: 'src/render.tsx',
      formats: ['es'],
      fileName: () => 'render.js',
    },
    rollupOptions: {
      // The host supplies these. Bundling React here would give a page two
      // copies of it, and hooks called against the wrong one throw.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      output: { assetFileNames: 'pr-radar.css' },
    },
  },
})
