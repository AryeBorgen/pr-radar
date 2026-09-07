#!/usr/bin/env node
/**
 * Serves the built dashboard so `npx pr-radar` needs nothing installed.
 *
 * Deliberately dependency-free: this package ships a bundle of static files and
 * a way to look at them, and pulling a server framework in to do that would add
 * an install and a supply chain for no benefit.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { handleAuth, originsFor } from './relay.js'
import { spawn } from 'node:child_process'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

if (!existsSync(join(root, 'index.html'))) {
  console.error(
    'pr-radar: no build found.\n' +
      'If you are running from a clone, build it first:  npm install && npm run build',
  )
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  // Not derivable from the extension by any convention, and a browser is
  // entitled to refuse a manifest served as something else.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    'pr-radar — every open pull request across all your repositories, on one screen\n\n' +
      'Usage: pr-radar [--port <n>] [--host <addr>] [--no-open] [--client-id <id>]\n' +
      '                [--push] [--token <t>] [--state-dir <path>]\n\n' +
      '  --port       port to listen on (default 4173, or the first free port after it)\n' +
      '  --host       address to bind (default 127.0.0.1; use 0.0.0.0 to expose it)\n' +
      '  --no-open    do not launch a browser\n' +
      '  --push       keep watching GitHub while the tab is closed, and send a\n' +
      '               notification when something changes. Needs a token to poll\n' +
      '               with: --token, or PR_RADAR_TOKEN. Without --push this server\n' +
      '               stores nothing and makes no request of its own.\n' +
      '  --token      a GitHub token for --push to poll with. Nothing is written to\n' +
      '               disk when you supply one; you keep it. Also PR_RADAR_TOKEN.\n' +
      '  --state-dir  where --push keeps its keys and its baseline\n' +
      '               (default $XDG_STATE_HOME/pr-radar or ~/.local/state/pr-radar).\n' +
      '  --client-id  a GitHub App or OAuth App client id, with device flow enabled,\n' +
      '               to offer "Sign in with GitHub" instead of asking for a token.\n' +
      '               Also read from PR_RADAR_CLIENT_ID. Not a secret: the device\n' +
      '               flow needs no client secret, which is why a page can use it.\n',
  )
  process.exit(0)
}

const host = flag('--host') ?? '127.0.0.1'
const startPort = Number(flag('--port') ?? process.env.PORT ?? 4173)

/*
 * Signing in with a GitHub account needs a client id, and a client id is not
 * something this project can ship for you: it identifies *your* GitHub App or
 * OAuth App, with device flow enabled on it. Without one, /auth/config answers
 * 404 and the page shows the token field alone -- which is exactly what the
 * hosted static site does, since it has no server to relay through either.
 *
 * There is no secret here and there is not meant to be: the device flow
 * authenticates with a client id alone, which is why it is the flow a page can
 * use. See docs/superpowers/specs/2026-09-04-device-login-design.md.
 */
const clientId = flag('--client-id') ?? process.env.PR_RADAR_CLIENT_ID ?? ''

/*
 * Push is opt-in, and everything it costs is behind this flag: the poll loop,
 * the file that holds a token, the VAPID keys. Without it this server is the
 * static file server it has always been -- which is what the "nothing to
 * configure" story rests on, so it stays true by construction rather than by
 * good intentions.
 */
const pushWanted = args.includes('--push')
const pushToken = flag('--token') ?? process.env.PR_RADAR_TOKEN ?? ''

/**
 * The page carries its own Content-Security-Policy in a meta tag, which covers
 * everything a meta tag can. These are the parts it cannot: frame-ancestors is
 * header-only, and the rest describe how the response itself may be treated.
 * The container serves the identical set from docker/security-headers.conf --
 * two install channels, one behaviour.
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
}

/**
 * The notifier, or nothing at all.
 *
 * Imported lazily so that a server started without `--push` never even loads
 * it: a build that is missing `dist-server/` should break push, not the
 * dashboard.
 */
let notifier = null
/** Absent unless --push loaded it; the route below answers 404 either way. */
let handlePush = null
if (pushWanted) {
  if (!pushToken) {
    console.error(
      'pr-radar: --push needs a token to poll GitHub with.\n' +
        '  pr-radar --push --token ghp_...      (or set PR_RADAR_TOKEN)\n' +
        'Nothing is written to disk when you supply one.',
    )
    process.exit(1)
  }
  const server_ = await import('../dist-server/index.js').catch(() => null)
  if (!server_) {
    console.error('pr-radar: --push needs a build. Run:  npm run build')
    process.exit(1)
  }
  const dir = server_.stateDir({ arg: flag('--state-dir') })
  try {
    notifier = server_.createNotifier({ dir, token: pushToken })
    // Resolve `@me` in the notification rules against whoever the token is,
    // not whoever the browser thinks it is: the token here is what does the
    // polling, and disagreeing silently would announce somebody else's work.
    notifier.setViewer(await server_.fetchViewer(pushToken))
    notifier.start()
    console.log(`pr-radar: watching for changes as ${notifier.viewer}; state in ${dir}`)
  } catch (error) {
    console.error(`pr-radar: ${error.message}`)
    process.exit(1)
  }
  handlePush = server_.handlePush
}

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)

  // Two routes that are not files. Everything under /auth/ is handled there and
  // never falls through to the bundle -- otherwise a missing route would answer
  // a fetch with index.html, and the page would report a JSON parse error
  // instead of a 404.
  if (path.startsWith('/auth/')) {
    handleAuth(request, response, { clientId, origins: originsFor(host, server.address()?.port ?? startPort) })
      .catch(() => {
        response.writeHead(500, { 'Content-Type': 'application/json', ...SECURITY_HEADERS })
        response.end('{"error":"internal"}')
      })
    return
  }

  // Same rule as /auth/: handled here and never falling through to the bundle,
  // or a missing route would answer a fetch with index.html and the page would
  // report a JSON parse error instead of a 404.
  if (path.startsWith('/push/')) {
    if (!handlePush) {
      // Started without --push. The page asks, is told no, and offers nothing
      // rather than showing a switch that cannot work.
      response.writeHead(404, { 'Content-Type': 'application/json', ...SECURITY_HEADERS })
      response.end('{"error":"push is not enabled on this server"}')
      return
    }
    handlePush(request, response, { notifier, headers: SECURITY_HEADERS }).catch(() => {
      response.writeHead(500, { 'Content-Type': 'application/json', ...SECURITY_HEADERS })
      response.end('{"error":"internal"}')
    })
    return
  }

  // normalize collapses `..` before it is joined, so a crafted path cannot
  // escape the bundle directory.
  const candidate = join(root, normalize(path))
  const found =
    candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()

  // A hashed asset name is never a route, so a miss under /assets/ is a missing
  // file rather than a deep link. Falling back to index.html there would answer
  // a <script> with markup, and the browser would report a syntax error inside
  // the HTML instead of the file that is actually absent. nginx is configured
  // the same way (`try_files $uri =404`); the two install channels have to
  // agree about what a missing file means.
  if (!found && path.startsWith('/assets/')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    response.end('Not found\n')
    return
  }

  const file = found ? candidate : join(root, 'index.html')

  // Only /assets/ carries a content hash in the filename, and only a hashed name
  // is safe to keep forever. Everything else has a stable URL whose contents
  // change on every deploy: index.html, the manifest, and -- the one that bites
  // -- sw.js. A service worker cached for a year is a service worker that can
  // never be replaced, which strands a visitor on an old build with no way back.
  // nginx draws the line in the same place, by location.
  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    ...SECURITY_HEADERS,
  })
  createReadStream(file).pipe(response)
})

function listen(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1)
      return
    }
    console.error(`pr-radar: ${error.message}`)
    process.exit(1)
  })

  server.listen(port, host, () => {
    const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`
    console.log(`pr-radar running at ${url}`)

    /*
     * Reaching this from a phone is the obvious next thought, and plain HTTP
     * over a network address does not work -- measured, not assumed. Two things
     * go wrong and neither says so:
     *
     *   - the page's own CSP carries `upgrade-insecure-requests`, so every
     *     asset request is rewritten to https, fails the handshake, and the
     *     page renders completely blank;
     *   - `navigator.serviceWorker` is *absent* outside a secure context, so
     *     push could not work even if the page loaded.
     *
     * A browser reports the first as a blank screen and the second as nothing
     * at all. Saying it here costs one line and saves the evening.
     */
    const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1'
    if (!loopback) {
      console.log(
        '\npr-radar: bound to a network address. Browsers treat plain http on a\n' +
          'network address as insecure: the page will not load and notifications\n' +
          'cannot work. Put it behind https to reach it from a phone -- a\n' +
          'Tailscale name or a tunnel both give you one.\n',
      )
    }
    console.log('Paste a GitHub personal access token to get started. Ctrl+C to stop.')
    if (!args.includes('--no-open')) open(url)
  })
}

function open(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
      .unref()
  } catch {
    // Not being able to launch a browser is not a reason to fail; the URL is printed.
  }
}

listen(startPort, 20)
