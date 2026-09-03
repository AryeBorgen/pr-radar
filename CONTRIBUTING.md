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
npm run typecheck   # tsc -b --force
npm test            # vitest
npm run build
```

CI runs exactly these. `typecheck` uses `tsc -b`, not `tsc --noEmit`: the root
`tsconfig.json` is a solution file with no `files`, so `--noEmit` type-checks
nothing at all and passes on code that does not compile.

## What the tests are for

The unit tests cover the parts with real logic — the filter language, the
review and check rollups, the facet axes, the period window and the
notification transitions. They are worth reading before changing any of those,
because several of them exist to pin down a decision rather than to check an
obvious behaviour. For instance, one test asserts that concatenating two axis
queries returns three results where applying them as separate stages returns
one. That is not a curiosity: it is the reason the code is shaped the way it is,
and the test is there so the reason cannot be quietly lost.

There is no browser test suite in the repository. The UI has been verified with
Playwright against a mocked `api.github.com` during development, and wiring that
up as a checked-in suite is an open task — see `CLAUDE.md`.

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
