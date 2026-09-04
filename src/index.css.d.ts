/*
 * TypeScript 7 wants a declaration for a side-effect import of a stylesheet, and
 * `vite/client` no longer supplies one. render.tsx imports the stylesheet so the
 * library build emits it; this is what makes that import type-check, alongside
 * `allowArbitraryExtensions` in tsconfig.app.json.
 */
declare const styles: void
export default styles
