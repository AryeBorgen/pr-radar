# PR Radar — working notes

A cross-repository pull request dashboard. Static, no backend, no database. The
page talks to `api.github.com` from the browser with a token the user pastes,
and keeps everything else in that browser.

Read `README.md` for what it does. This file is for the reasons behind how it is
built — the decisions that look arbitrary until you know what they prevent.

## The one-line summary of the architecture

Everything outside `src/lib/github.ts` works on the normalised `PullRequest`
type and never touches raw API shapes. That boundary is the most valuable thing
in the codebase: it is why replacing the entire data layer (GraphQL → REST)
changed one module and left the filter engine, the axes and the UI untouched.
**Keep it.** If you find yourself reaching for `raw.head.sha` outside that file,
normalise it into the type instead.

## Hard-won facts about the GitHub API

These are the constraints the design is bent around. Each one cost a debugging
cycle; none of them are guesses.

1. **The GraphQL API could not be called from a browser. It can now.** This note
   used to say the restriction was permanent. As of 2026-09-04 that is wrong, and
   it was checked rather than assumed: a preflight to `api.github.com/graphql`
   carrying `Authorization` and `Content-Type` comes back `204` with
   `access-control-allow-origin: *` and both headers named in
   `access-control-allow-headers` -- byte for byte what REST returns. A real
   Chromium sending the request the app would send resolves with `401`, the
   right answer to a made-up token, rather than rejecting.

   Two things follow. The move to REST was still correct, and is not worth
   undoing: the request budget, the enrichment cache and the closed-PR handling
   below are all shaped around REST, and going back buys a user nothing. And
   more importantly -- **a fact that cost a debugging cycle can still expire.**
   Re-run the check before repeating any of these to someone. That is what
   `tests/reachability.spec.ts` is for, and it is deliberately the one test that
   does not mock GitHub.
2. **The REST API does support CORS**, including preflight with an
   `Authorization` header. Verified with a token in a real browser.
3. **REST's pull-request list omits review decision and check state.** They are
   fetched per PR in a second pass — hence `useEnrichment`.
4. **Closed PRs can only be sorted by `updated`**, never by merge date. So a PR
   merged three months ago but commented on yesterday arrives near the top of
   the page. This is why the period filter reads `closedAt` and not `updatedAt`,
   and why `closedAt` exists on the type at all.
5. **The REST list has no comment count, line counts or mergeability.** Those
   live on the single-PR endpoint, a third request each. They were dropped
   rather than bought.

## Hard-won facts about the container

1. **`localhost` inside the container is not one address.** `/etc/hosts` maps it
   to both `127.0.0.1` and `::1`, and busybox `wget` tries `::1` first. nginx's
   `listen 80` binds IPv4 only — the official image's own `default.conf` does
   the same — so a `HEALTHCHECK` against `http://localhost/` is refused every
   time and the container sits at `unhealthy` while serving traffic perfectly.
   The probe now names `127.0.0.1`, and the server now also binds `[::]:80` so
   a client that resolves to an AAAA record is answered rather than refused.
2. **`listen [::]:80` is safe where IPv6 is switched off.** The socket family
   still exists even with `net.ipv6.conf.all.disable_ipv6=1` and no `inet6` on
   `lo`, so nginx starts either way. This was tested rather than assumed,
   because the failure mode it would otherwise introduce — a server that will
   not start at all — is worse than the bug being fixed. `smoke.sh` keeps
   asserting it.
3. **`docker compose --wait` has no default timeout.** A container that never
   reports healthy holds the job open until the job limit instead of failing,
   so CI passes `--wait-timeout`. A hang and a red build are not the same
   signal.

## Decisions worth not re-litigating

**Filter sources are separate stages, not one concatenated query.** The filter
language ORs repeated positive terms of the same qualifier, because GitHub does
and matching GitHub is a stated goal. That is right inside one query and wrong
across a stack of filters: `is:open` from the Status axis concatenated with
`is:draft` from the Drafts axis reads as "open **or** draft", and an author
picked from a menu would *widen* the result against `Who: Mine` instead of
intersecting it. `applyStages` filters through each stage in turn and sorts once
at the end. A test in `facets.test.ts` asserts the concatenated form returns 3
where the staged form returns 1, specifically so this reason cannot be lost.

An earlier commit tried to solve this by *banning* two axes from sharing a
qualifier, with a test enforcing disjointness. That was the wrong fix — it
constrained the design instead of correcting the composition — and it was
replaced. Status and Drafts now share `is:` deliberately.

**`UNKNOWN` is not `NONE`.** Review and check state arrive asynchronously.
`UNKNOWN` means "not answered yet"; `NONE` means "answered: there are none".
Collapsing them would make `review:none` silently wrong for every PR still
loading, would overstate the "Awaiting review" count, and would turn every first
page load into a burst of notifications. Anything you add that can be partially
known needs the same treatment.

**Drafts are shown by default.** At the shop this was built for, a review bot
moves a PR back to draft when review fails, so draft is a state to triage rather
than noise to hide. Two of the original default views quietly excluded drafts
and therefore hid exactly the PRs that needed attention.

**Enrichment is keyed by head SHA; notifications are keyed by repo and number.**
Different keys on purpose. Enrichment describes a commit, so a push should
invalidate it — that is what makes a two-minute poll cost nothing when nothing
changed. Notification identity must survive a push, or every commit would
announce the PR as new; keying on repo and number is what lets "CI went red on
the new commit" fire correctly.

**Only open PRs are enriched.** Review and check state on a merged PR is
history, and the list of merged PRs grows without bound.

**Closed PRs are not fetched until asked for.** The Status axis drives the
request, not just the filter. The default view is one request per repository.

## Request budget

This matters more than it looks; the app polls.

- List: one request per repository, six concurrent (`MAX_CONCURRENT_REQUESTS`).
- Enrichment: two per open PR (reviews + check-runs), cached by head SHA, so a
  poll that finds nothing new costs **zero** requests.
- Closed: one extra request per repository, one page of 100, no pagination.
- Limit is 5,000/hour. First load on ~15 repositories with ~150 open PRs is
  roughly 300 requests; steady state is ~15 per poll.

Going deeper into history would mean paginating per repository, which across an
organisation is hundreds of requests for pages nobody scrolls to. The period
filter and the page cap bound it instead, whichever bites first.

## Verification

`npm run test:all` -- typecheck, unit tests, build, browser tests. Plus
`scripts/cli-smoke.sh`, `scripts/lint-workflows.sh`, `docker/smoke.sh` and
`scripts/site-smoke.sh`, all of which CI runs.

**`typecheck` must be `tsc -b`, never `tsc --noEmit`.** The root `tsconfig.json`
is a solution file with empty `files`, so `--noEmit` compiles nothing and passes
on code that does not build. This was a live bug — CI was guarding nothing —
found by injecting a deliberate type error and watching it pass.

The unit tests cover the parts with real logic: the filter language, the review
and check rollups, the facets, the period window, the notification transitions.
Several exist to pin a decision rather than check a behaviour; read them before
changing those areas.

**The Docker image has a checked-in smoke test.** `docker/smoke.sh` builds
nothing; it takes an image tag, runs it, and asserts ten things over HTTP and
over `docker inspect`. It exists because the check it replaced curled the
published port — a path that already worked — and so passed on an image whose
own `HEALTHCHECK` was failing. **A check that exercises a different path from
the one that breaks is not a check.** Run it as `docker build -t pr-radar:x . &&
docker/smoke.sh pr-radar:x`.

**There is a checked-in browser suite**, in `tests/`, run with
`npm run test:browser`. It drives a real Chromium against the production bundle
served by `bin/pr-radar.js`, not against the dev server, because the artefact
users get is the one worth testing. Two rules hold it up:

- `reuseExistingServer` is off and the port is 41730. The suite first ran green
  against a container still listening on 4173 from an earlier session -- eight
  tests passing against the previous commit's bundle. **A suite that quietly
  tests a stale artefact is worse than one that fails.**
- `tests/reachability.spec.ts` deliberately does not mock GitHub, for the reason
  below. It is what corrected fact 1 above.

Two bugs the browser runs caught that unit tests could not: `<img src="">` when
an avatar is missing (React warns; the browser may re-request the page), and the
whole CORS failure, which was invisible precisely because the smoke test mocked
the endpoint it should have been exercising. **Mocking the thing under test
proves nothing.**

## Layout

```
src/lib/
  github.ts          REST client, normalisation, review/check rollups
  filter.ts          the query language: parse, match, stage, sort
  facets.ts          the three one-click axes (Status, Who, State, Drafts)
  menus.ts           the dynamic dropdowns + period + sort
  notifications.ts   transition detection (pure; the hook does the I/O)
  useEnrichment.ts   second-pass fetching with a SHA-keyed cache
  useNotifications.ts  fires Notifications, maintains the tab title
  storage.ts         localStorage, defensively parsed
src/components/      FacetBar, FilterMenus, SavedViews, FilterBar, PrRow,
                     NotifyMenu, RepoManager, TokenGate, icons
bin/pr-radar.js      dependency-free static server, so `npx pr-radar` works
```

## Open work, roughly in order of value

1. **Publish an npm release.** `.github/workflows/release.yml` builds, verifies,
   refuses a tag that disagrees with `package.json`, and publishes with
   `--provenance`. It has never run, and it cannot until an `NPM_TOKEN` secret
   exists on the repository. Until then the README says `npx pr-radar` *will*
   work rather than that it does, which is the honest tense.
2. **Editing the built-in axes.** Saved views can be created and deleted, but a
   built-in axis option cannot be edited. The workaround is typing into the
   filter box and saving a view.
3. **Team-level "waiting on your team".** GitHub distinguishes a review
   requested from you personally and from a team you belong to. Only the former
   is handled; the latter needs the team memberships of the viewer.
4. **Offline honesty.** The service worker serves the shell with no network, and
   the app then reports that it cannot reach GitHub. That is correct but blunt:
   a banner saying *when* the list was last fetched would be better than a plain
   error, and is the only thing the worker's design leaves on the table.
5. **A backend, if the trade is worth it.** Explicitly *optional* — see below.

Closed since this file was last revised: the Docker image was unproven and is
now built, probed on `arm64` and `amd64`, and published multi-arch; the browser
suite that was open work is in `tests/`; the site had no verified deploy and now
has `scripts/site-smoke.sh` running against the published URL.

## On adding a backend

This has been raised, and it is a real fork rather than a detail. A backend
would unlock things that genuinely cannot be done from a static page:

- **Real push**, so notifications arrive with the tab closed. Web Push needs a
  server holding VAPID keys.
- **OAuth**, replacing the pasted token. Re-verified in a real browser on
  2026-09-04, because the CORS note above it turned out to have expired and this
  one deserved the same scrutiny: it has not. `github.com/login/device/code`
  refuses a browser both as a preflighted request and as a simple form POST that
  triggers no preflight, and no GitHub OAuth endpoint sends
  `Access-Control-Allow-Origin`. The device flow needs no client secret, so the
  blocker is purely CORS -- which means the smallest thing that would unlock it
  is a stateless forwarder rather than a full OAuth backend. It would still see
  the resulting access token in the response body, which is the part worth
  arguing about before anyone writes it.
- **Server-side polling**, shared caching across a team, and history beyond what
  a page can hold.

What it costs is the reason it was not done: something to deploy and operate,
secrets to hold, and — the serious one — **holding other people's GitHub
tokens**, which turns a page with no attack surface into a system with a
significant one. It also breaks the distribution story: `npx pr-radar` and
`docker run` work precisely because there is nothing to configure.

If it happens, the shape that keeps both properties is an **optional** backend:
the static app stays the default and works exactly as it does now, and a
deployment that wants push and OAuth points it at a server via one environment
variable. Do not make the backend mandatory, and do not let its existence leak
into modules other than the data layer — the boundary described at the top of
this file is what would make that possible.
