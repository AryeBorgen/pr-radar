# Security

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/AryeBorgen/pr-radar/security/advisories/new).
Please do not open a public issue for anything exploitable.

Expect an acknowledgement within a few days. If a fix is warranted it ships as a
patch release and the advisory is published alongside it, crediting you unless
you would rather stay anonymous.

## What this project is, in security terms

PR Radar is a static page. There is no database, no account, and nothing that
stores anyone's data. It runs in your browser and reads everything it shows
straight from `api.github.com`.

The attack surface is concentrated in one place: **the GitHub credential the
page holds**, whether you pasted a token or signed in.

### How the credential is handled

- It is kept in `sessionStorage`, so it is gone when the tab closes. It is never
  written to disk by this app. A refresh token, where one exists, lives exactly
  as long as the access token it renews.
- Requests carrying it go to `api.github.com` and nowhere else. The
  Content-Security-Policy in `index.html` enforces that in the browser rather
  than promising it: `connect-src` names GitHub's API and, on a deployment that
  relays sign-in, that relay's origin — nothing else. A compromised dependency
  cannot post the credential to a host that is not on that list.
- It is never logged and never placed in a URL.

### One exception, and it is the important one

**Signing in passes the token through a relay.** GitHub's OAuth endpoints send
no `Access-Control-Allow-Origin`, so a page cannot complete the exchange itself
— measured on every test run in `tests/reachability.spec.ts`, not assumed. Two
requests therefore go through something server-side, and the access token comes
back in the second one's response.

Where that relay runs is the whole of the difference:

| How you run it | Where the relay is |
| --- | --- |
| `npx pr-radar` | the machine you started it on |
| the container | the machine running it |
| [the hosted page](https://aryeborgen.github.io/pr-radar/) | a Cloudflare Worker, [`worker/`](worker/) |
| a static host with no relay | there is none — the token field is the only way in, and no token ever passes through anything |

The relay holds no secret, keeps no session and writes nothing down: it forwards
two requests and rebuilds the reply from the fields the flow needs. It is about
a hundred lines and the rules it enforces are shared verbatim with the other two
servers, so they cannot drift apart — `tests/node/conformance.test.js` asks all
three the same questions and requires the same answers.

**The hosted worker is the one you are trusting with someone else's
infrastructure.** If that is not a trade you want, paste a token instead: that
path involves no relay at all, on any deployment.

The OAuth client id is public by design. The device flow authenticates with the
id alone — which is *why* a page can use it — so there is no secret in the
worker to leak, and none to rotate.

### It can now change your repositories

Since 0.3.0 the dashboard can **merge and close** a pull request. That is a write
against your repositories, made with your credential.

- Nothing happens on a first click. The menu opens; the destructive item opens a
  confirmation naming the repository and the number.
- There is no bulk action, and there will not be one.
- A merge sends the head commit's SHA, so a push that landed while the menu was
  open is refused by GitHub rather than merged over.
- A credential without write access simply cannot do it: GitHub refuses, and the
  page says the token is not allowed to write there.

### What you can do to reduce the blast radius

- Prefer a **fine-grained token** scoped to the repositories you actually want
  to watch. Read-only is enough for everything except merging and closing;
  public repositories need no scopes at all.
- On a shared or untrusted machine, treat the credential as you would a password
  typed into that machine, because that is what it is.
- Revoke it at any time — a token from
  [github.com/settings/tokens](https://github.com/settings/tokens), a sign-in
  from [the authorised applications list](https://github.com/settings/applications).
  Nothing in this project needs to be told.

## How the supply chain is protected

The realistic attack on a project like this is not against the running page. It
is against the pipeline that builds and publishes it.

- **Every GitHub Action is pinned to a commit SHA**, never a tag. A tag is a
  pointer its owner can move; a SHA cannot be moved. `scripts/lint-workflows.sh`
  fails the build if any `uses:` is left on a tag, and Dependabot keeps the pins
  current so the safety does not cost staleness.
- **Every workflow declares least-privilege `permissions:`.** The same linter
  fails a workflow that omits the block and would otherwise inherit whatever the
  repository default happens to be.
- **No workflow uses `pull_request_target`**, and none interpolates
  attacker-controlled text -- a pull request title, a comment body, a branch
  name -- into a shell command. Both are checked mechanically, because both are
  the kind of thing a hurried edit reintroduces.
- **Published artifacts carry provenance**, in two forms that are easy to
  confuse. The image is built with `provenance: mode=max` and an SBOM, which
  BuildKit attaches to the image, *and* it is attested to this repository with
  `actions/attest-build-provenance`, which is the record `gh attestation verify`
  reads. They are separate systems: an earlier version of this file documented
  the second while the workflow produced only the first, so the command below
  answered 404.
- **The npm release stores no credential.** npm accepts the release workflow's
  OIDC identity through trusted publishing, so there is no token here to leak and
  provenance is attached without being asked for. The alternative was a token
  permitted to bypass two-factor authentication -- which a CI publish requires,
  since nothing in a workflow can answer a 2FA prompt -- and npm's own token
  screen calls that a security risk and points automation at trusted publishing
  instead.

  One consequence, stated rather than hidden: trusted publishing is configured on
  a package's page, and there is no page until the package exists. **Version
  0.1.0 was published by hand and carries no provenance attestation.** Every
  release after it does. If you are verifying a tarball, verify 0.1.1 or later.
- **CodeQL** runs on every pull request and weekly, so a rule written after a
  merge still gets a chance to find something.
- **Secret scanning and push protection** are enabled on the repository.

## Verifying what you install

The container image, two independent ways:

```bash
# GitHub's attestation: which workflow, at which commit, built this digest.
gh attestation verify oci://ghcr.io/aryeborgen/pr-radar:latest --owner AryeBorgen

# BuildKit's own record, carried inside the image.
docker buildx imagetools inspect ghcr.io/aryeborgen/pr-radar:latest \
  --format '{{json .Provenance}}'
```

The first works for images published after 2026-09-04; earlier digests carry
only the second.

The npm package publishes with provenance, which npm displays on the package
page and `npm view pr-radar` reports.

Neither is a substitute for reading the source, which is the whole of the
application and is deliberately small.
