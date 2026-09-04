# Signing in with a GitHub account

## The problem, measured rather than assumed

A pasted personal access token works and is honest about what it is, but it asks
a developer to visit a settings page, choose scopes correctly, and paste a
credential into a page they have not read. Most people who bounce off this tool
bounce off there.

The obvious fix is a login. `CLAUDE.md` has said for months that it is not
possible from a static page, so it was re-measured on 2026-09-04 in a real
browser, from a page carrying no Content-Security-Policy so the app's own policy
could not be mistaken for GitHub's answer:

| Request | Result |
| --- | --- |
| `POST github.com/login/device/code`, form-encoded, no preflight | rejected -- no `Access-Control-Allow-Origin` |
| the same in `mode: 'no-cors'` | sent; response opaque, status 0 |
| `GET api.github.com/` (control) | `200`, `type=cors` |

The `no-cors` row is the one that settles it. The request *is* delivered; the
browser simply will not let the page read the reply. A flow whose entire purpose
is to read a code back out of that reply cannot be built on it. And the failure
is specific to `github.com/login/*`: the CORS-enabled host, `api.github.com`,
does not serve those endpoints -- it answers `404` for them.

So a login needs something server-side. That is the whole finding.

## The shape

`CLAUDE.md` argues, at length and correctly, against a backend: something to
deploy, secrets to hold, and other people's GitHub tokens sitting in a system
that currently has no attack surface at all. None of that changes.

What changes is noticing that **two of the three ways this is distributed already
run a server on the user's own machine.** `npx pr-radar` starts one. `docker run`
starts nginx. Neither is a service anybody operates; both are the user's.

So the relay goes there:

```
browser ──POST /auth/device/code──▶ pr-radar (localhost) ──▶ github.com/login/device/code
```

Three properties fall out of that placement, and they are the argument:

1. **No secret exists.** The device flow authenticates with a `client_id` alone
   -- it is designed for clients that cannot keep a secret, which is exactly what
   a page is. There is nothing to store, rotate or leak.
2. **Nobody else's token is held.** The relay is a pipe. It parses no token,
   keeps no session, writes nothing to disk. The access token lands in the
   browser, the same place the pasted one lands today.
3. **It is the user's own machine.** The forwarder that sees the token in
   transit is the one the user started. That is the objection `CLAUDE.md` raises
   about a hosted backend, and placing the relay on localhost answers it rather
   than accepting it.

The hosted page on GitHub Pages has no server and therefore no login. It keeps
the token field, and says why in one sentence rather than offering a button that
cannot work.

## What the client sees

One endpoint decides which door to show:

```
GET /auth/config  ->  200 {"deviceFlow": true, "clientId": "Iv1..."}   relay present
                  ->  404                                              static host
```

The token gate asks once, at load. `404` is not an error; it is the static
deployment answering correctly. Nothing about the token path changes, and it
remains the only path when the answer is `404`.

## Not an open proxy

A process on a developer's laptop that forwards arbitrary requests is a hole,
and it would be one introduced in the name of convenience. The relay is
therefore not a proxy at all:

- Exactly two routes. `POST /auth/device/code` and `POST /auth/device/token`.
- The upstream is a constant. Neither route reads a target from the request;
  there is no parameter that could name a different host.
- Only `client_id`, `scope`, `device_code` and `grant_type` are forwarded, each
  matched against a pattern. Everything else in the body is dropped.
- No request header reaches GitHub. Not `Authorization`, not `Cookie`, not
  `Origin`.
- The response is re-serialised from the fields the flow needs, so nothing
  unexpected upstream is passed through verbatim.
- `POST` only, same-origin only, with a body size cap.

`tests/relay.spec.ts` asserts each of these by attempting the abuse, because a
restriction nobody has tried to break is a comment.

## Tokens, and what is done with them

A GitHub App's user-to-server token expires in eight hours and comes with a
refresh token. An OAuth App's does not expire. The flow is identical up to that
point, so the client handles both: if a `refresh_token` comes back it is kept
and used, and if it does not, nothing is.

Storage does not change. `sessionStorage`, cleared when the tab closes, exactly
as the pasted token is today -- a token obtained more conveniently is not a
token that deserves to live longer.

## Testing

- `deviceAuth.ts` is a pure state machine over the flow's responses, including
  every documented error (`authorization_pending`, `slow_down`, `expired_token`,
  `access_denied`), unit-tested without a network.
- The relay's refusals are tested by attempting them.
- A browser test drives the whole flow against a mocked GitHub, and asserts the
  static case shows no button.
- `docker/smoke.sh` gains the same two routes, because nginx and the Node server
  must agree, and the way they would stop agreeing is silent.
