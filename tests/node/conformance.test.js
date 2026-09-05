import { createServer } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Every server that relays the sign-in must answer identically.
 *
 * Three of them now: `npx pr-radar`, the container, and the Cloudflare Worker
 * that gives the hosted static page a relay it has no machine for. All three
 * load relay-policy.js so the *rules* cannot diverge, but each has its own
 * plumbing around it, and plumbing is where a check quietly stops running:
 * nginx answers a large body from its own error page, njs reads headers by a
 * different name, a route is added to one config and forgotten in another.
 *
 * The worker differs in exactly one way, deliberately: it sends CORS headers,
 * because it is cross-origin by definition where the other two are same-origin.
 * That difference is asserted on its own, in worker.test.js, rather than
 * quietly excused here.
 *
 * So every refusal is asked of both, over HTTP, and the answers are compared to
 * each other rather than to a list written down here. A difference is a failure
 * even where both answers look reasonable.
 *
 * Skipped, loudly, when Docker is not available -- but never silently, because
 * a conformance suite that quietly tests one implementation is worse than none.
 */

const IMAGE = process.env.PR_RADAR_IMAGE ?? 'pr-radar:auth'
const CLIENT_ID = 'Iv1.conformance'

function workerAvailable() {
  try {
    execFileSync('npx', ['wrangler', '--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

let worker

function dockerAvailable() {
  try {
    execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Every request the fake GitHub received. */
let received = []
let fakeGitHub
let fakeGitHubPort

/** The two servers under test, as base URLs. */
const servers = {}
const started = []

before(async () => {
  fakeGitHub = createServer((request, response) => {
    let body = ''
    request.on('data', (c) => (body += c))
    request.on('end', () => {
      received.push({ url: request.url, headers: request.headers, body })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ device_code: 'd', user_code: 'U-C', verification_uri: 'https://github.com/login/device', leaked: 'should be dropped' }))
    })
  })
  // 0.0.0.0 so the container can reach it through the host gateway.
  await new Promise((r) => fakeGitHub.listen(0, '0.0.0.0', r))
  fakeGitHubPort = fakeGitHub.address().port

  // The CLI server.
  const cli = spawn(process.execPath, ['bin/pr-radar.js', '--port', '41831', '--no-open', '--client-id', CLIENT_ID], {
    env: { ...process.env, PR_RADAR_UPSTREAM: `http://127.0.0.1:${fakeGitHubPort}` },
    stdio: 'ignore',
  })
  started.push(() => cli.kill())
  servers.cli = 'http://127.0.0.1:41831'

  // The worker, through wrangler's local runtime.
  if (workerAvailable()) {
    worker = spawn(
      'npx',
      ['wrangler', 'dev', '--port', '41833', '--local', '--var',
       `PR_RADAR_CLIENT_ID:${CLIENT_ID}`, '--var',
       `PR_RADAR_UPSTREAM:http://127.0.0.1:${fakeGitHubPort}`, '--var',
       'PR_RADAR_ORIGINS:http://127.0.0.1:4173'],
      { cwd: 'worker', stdio: 'ignore' },
    )
    started.push(() => worker.kill())
    servers.worker = 'http://127.0.0.1:41833'
  }

  if (dockerAvailable()) {
    execFileSync('docker', ['rm', '-f', 'pr-radar-conformance'], { stdio: 'ignore' })
    // By address, not by name. njs resolves through nginx's `resolver`, which is
    // a DNS server: it never reads /etc/hosts, so `host.docker.internal` and
    // `--add-host` are invisible to it and every fetch fails to resolve.
    //
    // And it has to be the address `--add-host` would have given, not the
    // default route. On Docker Desktop those differ -- the route points at the
    // bridge inside the VM (172.17.0.1) while the host is somewhere else
    // entirely (192.168.65.254) -- so taking the route gets a connection
    // refused from a gateway that is not the host at all.
    const gateway = execFileSync('docker', [
      'run', '--rm', '--add-host', 'host.docker.internal:host-gateway', IMAGE,
      'sh', '-c', 'getent hosts host.docker.internal | cut -d" " -f1',
    ]).toString().trim()
    assert.match(gateway, /^\d+\.\d+\.\d+\.\d+$/, `could not find the host address from inside a container: ${gateway}`)
    execFileSync('docker', [
      'run', '-d', '--name', 'pr-radar-conformance', '-p', '41832:80',
      '-e', `PR_RADAR_CLIENT_ID=${CLIENT_ID}`,
      '-e', `PR_RADAR_UPSTREAM=http://${gateway}:${fakeGitHubPort}`,
      IMAGE,
    ], { stdio: 'ignore' })
    started.push(() => execFileSync('docker', ['rm', '-f', 'pr-radar-conformance'], { stdio: 'ignore' }))
    servers.container = 'http://127.0.0.1:41832'
  }

  // Wait for both to answer rather than sleeping a guessed amount.
  for (const base of Object.values(servers)) {
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(`${base}/auth/config`)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
  }
})

after(() => {
  for (const stop of started) try { stop() } catch { /* already gone */ }
  fakeGitHub?.close()
})

async function ask(base, path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return {
    status: response.status,
    error: typeof parsed === 'object' && parsed !== null ? parsed.error : undefined,
    cacheControl: response.headers.get('cache-control'),
    cors: response.headers.get('access-control-allow-origin'),
  }
}

/** Ask every server the same question and require identical answers. */
function bothAgree(name, request, expected) {
  it(name, async () => {
    received = []
    const answers = {}
    for (const [which, base] of Object.entries(servers)) {
      answers[which] = await ask(base, request.path, request)
    }
    if (expected) {
      for (const [which, answer] of Object.entries(answers)) {
        assert.partialDeepStrictEqual(
          answer, expected,
          `${which} answered ${JSON.stringify(answer)}`,
        )
      }
    }
    // Compared to each other, not to a list written down here: a difference is
    // a failure even where both answers look reasonable.
    for (const [which, answer] of Object.entries(answers)) {
      if (which === 'cli') continue
      assert.deepEqual(
        answer, answers.cli,
        `${which} and the CLI disagree:\n  ${which.padEnd(9)} ${JSON.stringify(answer)}\n  cli       ${JSON.stringify(answers.cli)}`,
      )
    }
  })
}

describe('the relay, through every server that ships it', () => {
  it('is testing both, or says which one is missing', () => {
    const which = Object.keys(servers).join(' and ')
    if (servers.container === undefined) {
      console.log(`\n  NOTE: the container was not tested (${IMAGE} is not built).`)
      console.log('        docker build -t pr-radar:auth .\n')
    }
    if (servers.worker === undefined) {
      console.log('\n  NOTE: the worker was not tested (wrangler is unavailable).\n')
    }
    console.log(`  testing: ${which}`)
    assert.ok(servers.cli, `expected at least the CLI; got ${which}`)
  })

  bothAgree('offers the flow when a client id is configured',
    { path: '/auth/config' }, { status: 200 })

  bothAgree('never lets a token response be cached',
    { path: '/auth/config' }, { cacheControl: 'no-store' })

  bothAgree('sends no CORS header, so a cross-origin preflight cannot succeed',
    { path: '/auth/config' }, { cors: null })

  bothAgree('refuses an unknown route under /auth/ as JSON, not as the app',
    { path: '/auth/nope' }, { status: 404, error: 'not_found' })

  bothAgree('refuses POST on the config route',
    { path: '/auth/config', method: 'POST', body: {} }, { status: 405 })

  bothAgree('refuses GET on a device route',
    { path: '/auth/device/code' }, { status: 405 })

  bothAgree('refuses a form-encoded body, the one that needs no preflight',
    { path: '/auth/device/code', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'client_id=x' },
    { status: 415 })

  bothAgree('refuses a request from another origin',
    { path: '/auth/device/code', method: 'POST', headers: { Origin: 'https://evil.example' }, body: {} },
    { status: 403 })

  bothAgree('refuses a body that is not JSON',
    { path: '/auth/device/code', method: 'POST', body: 'not json' }, { status: 400 })

  bothAgree('refuses a scope carrying a newline',
    { path: '/auth/device/code', method: 'POST', body: { scope: 'repo\r\nX-Evil: 1' } },
    { status: 400 })

  bothAgree('refuses a device_code shaped like a path',
    { path: '/auth/device/token', method: 'POST', body: { device_code: '../../etc/passwd' } },
    { status: 400 })

  bothAgree('refuses a grant_type other than the device flow',
    { path: '/auth/device/token', method: 'POST', body: { grant_type: 'client_credentials' } },
    { status: 400 })

  bothAgree('refuses a body larger than the protocol needs',
    { path: '/auth/device/code', method: 'POST', body: { scope: 'x'.repeat(9000) } },
    { status: 413 })
})

describe('what reaches GitHub, from every server', () => {
  const forwards = (name, request, check) => {
    it(name, async () => {
      for (const [which, base] of Object.entries(servers)) {
        received = []
        await ask(base, request.path, request)
        assert.equal(received.length, 1, `${which} sent ${received.length} requests to GitHub`)
        check(received[0], which)
      }
    })
  }

  forwards('the client id is the server\'s own, never the caller\'s',
    { path: '/auth/device/code', method: 'POST', body: { client_id: 'Iv1.ATTACKER', scope: 'repo' } },
    (sent, which) => assert.equal(JSON.parse(sent.body).client_id, CLIENT_ID, `${which} forwarded the caller's client id`))

  forwards('no header from the incoming request is passed on',
    { path: '/auth/device/code', method: 'POST', headers: { Authorization: 'Bearer stolen', Cookie: 'session=stolen' }, body: { scope: 'repo' } },
    (sent, which) => {
      assert.equal(sent.headers.authorization, undefined, `${which} forwarded Authorization`)
      assert.equal(sent.headers.cookie, undefined, `${which} forwarded Cookie`)
    })

  forwards('a field GitHub did not need to see is dropped',
    { path: '/auth/device/code', method: 'POST', body: { scope: 'repo', redirect_uri: 'https://evil.example' } },
    (sent, which) => assert.equal(JSON.parse(sent.body).redirect_uri, undefined, `${which} forwarded redirect_uri`))

  it('rebuilds the reply, dropping anything unexpected upstream sent', async () => {
    for (const [which, base] of Object.entries(servers)) {
      const response = await fetch(`${base}/auth/device/code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"scope":"repo"}',
      })
      const body = await response.json()
      assert.equal(body.leaked, undefined, `${which} passed an unexpected upstream field through`)
      assert.equal(body.user_code, 'U-C', `${which} lost a field the flow needs`)
    }
  })
})
