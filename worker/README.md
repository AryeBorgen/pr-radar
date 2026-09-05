# The hosted sign-in relay

`npx pr-radar` and the container relay sign-in from the machine the user
started, which is most of the security argument for having a relay at all. The
hosted page on GitHub Pages has no machine to relay from — Pages serves static
files and nothing else — so it needs somewhere, and this is the smallest
somewhere there is.

It forwards two requests and holds nothing. The rules are in
`../bin/relay-policy.js`, the same file the other two servers load, and
`tests/node/conformance.test.js` asks all three the same questions and requires
the same answers.

## What is different here, and why

**This relay sends CORS headers. The local ones deliberately never do.**

A same-origin relay can refuse every cross-origin request outright, and that
closes a real hole: any page on the internet could otherwise POST to a
developer's `localhost:4173`. This relay is cross-origin *by definition* — the
page is on `github.io` and the worker is not — so it has to answer preflights.

The allowlist is the entire mitigation, so it is what `tests/node/worker.test.js`
attacks: a wildcard, a prefix match, a lookalike origin, a missing `Vary`. Each
was introduced deliberately and watched to fail.

## Deploying

```bash
cd worker
npx wrangler deploy
npx wrangler secret put PR_RADAR_CLIENT_ID   # not actually a secret; see below
```

Two variables, **neither of them a credential**:

| Variable | What it is |
| --- | --- |
| `PR_RADAR_CLIENT_ID` | The OAuth App's client id. Public by design: the device flow exists precisely because a page cannot keep a secret, and it authenticates with the id alone. |
| `PR_RADAR_ORIGINS` | Comma-separated origins allowed to call this. Never `*`. |

There is nothing here to rotate and nothing to leak. If this worker were taken
over entirely, the worst it could do is forward device-flow requests for an
application the attacker could have registered themselves in a minute.

## Pointing the site at it

The page has to be built knowing where the relay is, because it is a property of
the deployment rather than of the user:

```bash
PR_RADAR_RELAY=https://pr-radar-auth.<subdomain>.workers.dev npm run build
```

That does two things: the page asks that origin for `/auth/config` instead of
its own, and the build adds the origin to `connect-src`. **Both are required.**
Without the second the browser blocks the request with no error the page can
see, which looks exactly like the relay being down.
