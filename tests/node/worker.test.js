import { createServer } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The one way the hosted relay differs, attacked.
 *
 * `npx pr-radar` and the container are same-origin, so they refuse every
 * cross-origin request outright and send no CORS header ever. This worker
 * cannot: the page is on github.io and the worker is somewhere else, so it is
 * cross-origin by definition and has to answer preflights.
 *
 * That makes it the weakest of the three by necessity, and the allowlist is
 * the entire mitigation. So the allowlist is what these tests attack. Every
 * other behaviour is compared against the other two servers in
 * conformance.test.js; nothing here repeats that.
 */

const ALLOWED = 'https://aryeborgen.github.io'
const CLIENT_ID = 'Iv1.workertest'
const BASE = 'http://127.0.0.1:41834'

let worker
let fake

/*
 * Decided at module load, synchronously, because `describe`'s `skip` takes a
 * boolean and is read when the suite is *registered* -- before any `before`
 * hook runs. Written as `skip: () => !available` first, and a function is
 * always truthy, so every test in this file was skipped and the run reported
 * `# pass 0` as success. Second time this project has silently skipped a suite.
 */
const available = (() => {
  try {
    execFileSync('npx', ['wrangler', '--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

before(async () => {
  if (!available) return

  fake = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('{"device_code":"d","user_code":"U","verification_uri":"https://x"}')
  })
  await new Promise((r) => fake.listen(0, '127.0.0.1', r))

  worker = spawn(
    'npx',
    ['wrangler', 'dev', '--port', '41834', '--local',
     '--var', `PR_RADAR_CLIENT_ID:${CLIENT_ID}`,
     '--var', `PR_RADAR_UPSTREAM:http://127.0.0.1:${fake.address().port}`,
     '--var', `PR_RADAR_ORIGINS:${ALLOWED}`],
    { cwd: 'worker', stdio: 'ignore' },
  )
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(`${BASE}/auth/config`)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
})

after(() => {
  worker?.kill()
  fake?.close()
})

const ask = (path, init = {}) => fetch(BASE + path, init)

describe('the allowlist', { skip: !available }, () => {
  it('answers an origin it was told about', async () => {
    const response = await ask('/auth/config', { headers: { Origin: ALLOWED } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED)
  })

  // The whole reason this relay can exist without being a hole.
  it('refuses one it was not, and tells it nothing', async () => {
    const response = await ask('/auth/config', { headers: { Origin: 'https://evil.example' } })
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })

  // A wildcard here would let any page on the internet drive sign-ins through
  // this worker. It must never appear, whatever the origin.
  it('never answers with a wildcard', async () => {
    for (const origin of [ALLOWED, 'https://evil.example', undefined]) {
      const response = await ask('/auth/config', origin ? { headers: { Origin: origin } } : {})
      assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
    }
  })

  it('refuses a preflight from an origin not on the list', async () => {
    const response = await ask('/auth/device/code', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })

  it('answers a preflight from one that is', async () => {
    const response = await ask('/auth/device/code', {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED)
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /content-type/i)
  })

  // Without this a shared cache can serve an allowed origin's response, CORS
  // header and all, to an origin that was never allowed.
  it('varies on Origin, so a cache cannot leak one origin\'s answer to another', async () => {
    const response = await ask('/auth/config', { headers: { Origin: ALLOWED } })
    assert.match(response.headers.get('vary') ?? '', /origin/i)
  })

  it('still refuses to be a cache anywhere', async () => {
    const response = await ask('/auth/config', { headers: { Origin: ALLOWED } })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })

  // A caller with no Origin is not a browser page and cannot be driven by a
  // hostile site, which is the threat the list closes.
  it('serves a caller with no Origin at all, without a CORS header', async () => {
    const response = await ask('/auth/config')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })

  // An origin that merely starts with an allowed one -- the classic
  // startsWith bug -- is a different site.
  it('refuses a lookalike origin', async () => {
    for (const origin of [
      `${ALLOWED}.evil.example`,
      `${ALLOWED}:8080`,
      'http://aryeborgen.github.io',
      'https://aryeborgen.github.io.evil.example',
    ]) {
      const response = await ask('/auth/config', { headers: { Origin: origin } })
      assert.equal(response.status, 403, `${origin} was allowed`)
    }
  })
})

describe('with no origins configured at all', { skip: !available }, () => {
  // A worker deployed without PR_RADAR_ORIGINS should be useless to a browser
  // rather than open to one. Checked by asking the running worker with an
  // origin it cannot possibly have on its list.
  it('is closed rather than open', async () => {
    const response = await ask('/auth/config', { headers: { Origin: 'https://anything.example' } })
    assert.equal(response.status, 403)
  })
})

/*
 * A suite that runs nothing must say so. `# pass 0` reads as success in every
 * summary there is, which is how the mistake above went unnoticed for a run.
 */
describe('this file', () => {
  it('actually ran, or explains why not', () => {
    if (!available) {
      console.log('\n  NOTE: the worker was not tested -- wrangler is unavailable.')
      console.log('        npm i, then re-run: these are the only tests of the')
      console.log('        one relay that answers cross-origin requests.\n')
    }
    assert.ok(true)
  })
})
