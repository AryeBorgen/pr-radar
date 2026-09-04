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

## The published package is tested as a package

`npm run test:all` includes three checks that run against the built artifact
rather than the source, because the source compiles fine in all the cases they
catch:

```bash
npm run test:package    # publint, then are-the-types-wrong on a real npm pack
npm run test:types      # a consumer compiled under moduleResolution: nodenext
npx playwright test tests/surface.spec.ts
```

They exist because writing a library is not the same as publishing one. Both
defects found so far were invisible to `tsc -b`: the emitted `render.d.ts`
imported `./types` with no extension, which no consumer on `nodenext` can
resolve, and it imported a stylesheet, which no consumer can resolve at all.
`import type` is erased before the bundler sees it, so nothing failed to build
-- the package was simply unusable by anyone who installed it.

`tests/consumer/index.ts` is written almost entirely in `@ts-expect-error`. Each
one is a negative test: TypeScript reports an unused directive, so the file goes
red the moment an error *stops* happening. Making `token` optional in the
declaration fails it; leaking `PullRequest` fails it. Both were injected and
watched to fail before the file was committed, which is the only thing that
distinguishes a negative test from a comment.

`tests/render.d.ts.snapshot` is the public declaration, checked in whole, so a
change to the API arrives as a diff a reviewer can read.

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

## Every change that reaches users needs an issue

A pull request that touches the application has to close one:

```
Fixes #123
```

`Closes` and `Resolves` work too. For work spread over several pull requests,
where only the last one should close the issue, any of `Refs`, `Part of`,
`Step 2 of`, `Towards` or `Related to` links it without closing anything.

A bare `#123` does not count. It turns up in prose constantly -- "see #123 for
background", a quoted error, a version number -- and a word in front of it is
what separates a claim of intent from an accident.

The check reads the issue and requires it to be open, in this repository, and
opened from one of the forms. That last part is the point: the rule invites
somebody to file two words purely to get past it, and an issue like that is worse
than none, because it looks like context and is not.

**Most pull requests need no line at all.** Infrastructure, documentation, media
and version bumps are exempt, and so is anything from a bot -- the check works
that out from the files rather than asking. Run over this repository's own
history it excuses roughly half of what has been merged. For the rare change that
genuinely does not warrant an issue, a maintainer applies the `no-issue` label.

**Never put a closing keyword next to an issue number in prose.** GitHub matches
`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves` and
`resolved` anywhere in a commit message, in any tense, and does not care what the
sentence around them was doing.

This issue was lost to it twice in an hour. The first commit explained why the
rule should not demand a closing keyword on every pull request, and quoted one as
an example. The second warned against exactly that -- and its own message opened
with "GitHub closed #26 because...", which shut it a second time.

(That sentence is safe here: GitHub scans commit messages and pull request
descriptions, not the files in them. A commit message containing it is not.)

If you need to refer to one in writing, describe it ("a closing keyword") or put
the number somewhere else in the sentence. `Refs #26` on its own line is the
reference; everything else is prose, and prose is where this bites.

The decision lives in `src/lib/issueLink.ts` with unit tests, not inside the
workflow, so it can be argued with and corrected without opening a pull request
to find out what it does.

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
version to have a tag and a release, every release to be on npm, and the release
marked "Latest" to be the highest version. They drift apart quietly otherwise,
because none of it breaks anything. GitHub picked v0.1.0 as Latest over v0.1.1
purely because those two releases were cut out of order, and the releases page
offered a stale version to anyone who landed on it.

After publishing, the release workflow installs the package **from the registry**
and mounts it in a browser:

```bash
scripts/published-smoke.sh 0.2.0    # or `latest`
```

It runs `tests/embed.spec.ts` against the installed copy rather than a separate
suite, so the two cannot drift. This is the last line of defence and it is not
theoretical: the library's first build referenced `process.env.NODE_ENV`, a Node
global, and threw `process is not defined` in any page without a bundler --
which is the exact case an imperative `renderRadar` exists to serve. The
compiler, the unit tests, the type tests and the bundle all passed.

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
