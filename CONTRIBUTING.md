# Contributing

## Getting set up

```bash
npm install
npm run dev
```

Then paste a GitHub personal access token. Nothing else is required — there is
no server, no database and no configuration file.

## Before you push

```bash
npm run test:all    # typecheck, unit tests, build, then the browser tests
```

That is what CI runs, and it expands to:

```bash
npm run typecheck        # tsc -b --force
npm test                 # vitest, over src/ only
npm run build
npm run test:browser     # playwright, against the built bundle
```

`typecheck` uses `tsc -b`, not `tsc --noEmit`: the root `tsconfig.json` is a
solution file with no `files`, so `--noEmit` type-checks nothing at all and
passes on code that does not compile.

The first browser run needs a browser: `npx playwright install chromium`.

Two more suites run in CI and are worth running by hand when you touch what they
cover:

```bash
scripts/cli-smoke.sh                          # packs, installs and probes the npm package
scripts/lint-workflows.sh                     # the security rules the workflows must follow
docker build -t pr-radar:x . && docker/smoke.sh pr-radar:x
scripts/site-smoke.sh https://example.com/    # a deployed site, from the outside
```

## What the tests are for

The unit tests cover the parts with real logic — the filter language, the
review and check rollups, the facet axes, the period window and the
notification transitions. They are worth reading before changing any of those,
because several of them exist to pin down a decision rather than to check an
obvious behaviour. For instance, one test asserts that concatenating two axis
queries returns three results where applying them as separate stages returns
one. That is not a curiosity: it is the reason the code is shaped the way it is,
and the test is there so the reason cannot be quietly lost.

The browser tests in `tests/` cover what a unit test structurally cannot see: a
Content-Security-Policy that silently drops a stylesheet, an `<img src="">` React
warns about, a service worker caching something it should not. They run against
the production bundle served by `bin/pr-radar.js` — the same file `npx pr-radar`
installs — rather than against the dev server, because two of the bugs this
project has shipped were invisible to a dev server.

Two rules about them, both learned the hard way:

- **Never reuse a server that is already listening.** The suite first ran green
  against a container left over from an earlier session, quietly testing the
  previous commit's bundle. `reuseExistingServer` is off and the port is one
  nothing else documents.
- **`tests/reachability.spec.ts` must not mock GitHub.** Every other spec mocks
  `api.github.com`, which is right for testing this application. That one is
  testing whether GitHub can be reached from a browser at all, and mocking the
  endpoint under test is how the original GraphQL data layer passed its smoke
  test right up until it reached a real browser. It has already earned its keep:
  it disproved the first "hard-won fact" in `CLAUDE.md`.

## When a comment turns out to be wrong

This repository documents its reasons, which means it also accumulates reasons
that have expired. `CLAUDE.md` used to state flatly that GitHub's GraphQL API
could not be called from a browser; as of 2026-09-04 it can. The note is now
corrected and dated, with the check that settles it written down.

If you find one of these, fix the note and say how you checked. A confidently
wrong comment costs more than no comment at all.

## Releases

A release is a tag. `main` is protected, so the version bump goes through a pull
request like anything else, and then:

```bash
git tag -a v0.1.2 -m "0.1.2"
git push origin v0.1.2
```

`.github/workflows/release.yml` runs the whole suite, refuses outright if the tag
disagrees with `package.json`, publishes to npm through the workflow's own OIDC
identity with no stored credential, and cuts the GitHub release with notes
scoped to what changed since the previous tag.

**Do not publish by hand.** `0.1.0` was, and it cannot be reproduced: its
JavaScript matches a build of `b76d04d` byte for byte, and its stylesheet carries
a rule no clean checkout of that commit produces -- it was packed from a tree a
failed build had left half-written. The workflow builds from a fresh checkout, so
there is no previous state for it to inherit. A working tree is not a commit, and
nothing published from one can be verified afterwards.

`scripts/check-releases.sh` runs on every pull request and requires every npm
version to have a tag and a release, and every release to be on npm. They drift
apart quietly otherwise, because neither direction breaks anything.

## Style

Match the surrounding code. A few conventions that are load-bearing rather than
cosmetic:

- **Normalise at the boundary.** Everything outside `src/lib/github.ts` works on
  the `PullRequest` type, never on raw API shapes. That is what made moving from
  GraphQL to REST a one-module change.
- **Comment the *why*.** The code says what it does. Comments are for the
  reasons that are not visible from the code — an API limitation, a trade-off, a
  choice that looks arbitrary until you know what it prevents.
- **Never let a filter lie.** An unsupported qualifier is reported in the UI, and
  state that has not loaded is `UNKNOWN` rather than being folded into `NONE`.
  If you add something that can be partially known, keep that distinction.
