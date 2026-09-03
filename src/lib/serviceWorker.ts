/**
 * Registering the service worker is what makes the app installable and makes a
 * second visit instant. What it caches, and what it pointedly does not, is
 * explained in `public/sw.js`.
 *
 * Registration is skipped in development, where a worker serving a cached shell
 * in front of the dev server is a source of confusion rather than speed.
 */
export function registerServiceWorker() {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch(() => {
      // A failed registration costs the install prompt and nothing else. The
      // app works without it, so there is nothing here worth interrupting
      // anyone over.
    })
  })
}
