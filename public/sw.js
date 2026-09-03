/*
 * The service worker exists to make the app installable and to make a second
 * visit instant. It deliberately does not try to make the data available
 * offline.
 *
 * Pull request state is live. A cached list of pull requests is a *wrong* list
 * of pull requests, shown with no indication that it is stale, in a dashboard
 * whose entire job is telling you what is waiting on you right now. So nothing
 * from api.github.com is ever touched here -- those requests are passed
 * straight through and fail honestly when there is no network.
 *
 * The two caching rules mirror the HTTP headers the servers already send, for
 * the same reasons:
 *
 *   - Hashed assets are immutable, so they are served from the cache first. A
 *     new build produces new filenames, so this can never go stale.
 *   - The document is not, so it is fetched from the network first. Serving a
 *     cached index.html would pin a visitor to an old bundle indefinitely --
 *     the exact failure `Cache-Control: no-cache` exists to prevent.
 */

const VERSION = 'v1'
const SHELL = `pr-radar-shell-${VERSION}`
const ASSETS = `pr-radar-assets-${VERSION}`
const KEEP = [SHELL, ASSETS]

// Registration passes the scope's index URL, so the worker does not need to
// know whether it is deployed at / or at /<repo>/.
const INDEX = new URL('./', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(INDEX, { cache: 'reload' })))
      // A failed precache must not block activation; the fetch handler copes.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Anything not served by this origin -- GitHub's API, avatars -- is none of
  // this worker's business.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request))
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS))
  }
})

async function networkFirstDocument(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL)
      cache.put(INDEX, response.clone())
    }
    return response
  } catch {
    // Offline. The shell renders and the app reports that it cannot reach
    // GitHub, which is true and more useful than a browser error page.
    const cached = await caches.match(INDEX)
    if (cached) return cached
    throw new Error('offline and nothing cached')
  }
}

async function cacheFirst(request, name) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(name)
    cache.put(request, response.clone())
  }
  return response
}
