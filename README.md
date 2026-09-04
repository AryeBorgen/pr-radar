<div align="center">

<img src="media/mascot.svg" alt="" width="112">

# PR Radar

**Every open pull request across all your repositories, on one screen.**

### [→ Open it](https://aryeborgen.github.io/pr-radar/)

No install, no sign-up, no server. Works on a laptop and on a phone.

[![CI](https://github.com/AryeBorgen/pr-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/AryeBorgen/pr-radar/actions/workflows/ci.yml)
[![Docker image](https://github.com/AryeBorgen/pr-radar/actions/workflows/docker.yml/badge.svg)](https://github.com/AryeBorgen/pr-radar/actions/workflows/docker.yml)
[![CodeQL](https://github.com/AryeBorgen/pr-radar/actions/workflows/codeql.yml/badge.svg)](https://github.com/AryeBorgen/pr-radar/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/pr-radar.svg)](https://www.npmjs.com/package/pr-radar)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Start here

Three steps, about a minute, nothing to install.

1. **[Open the app](https://aryeborgen.github.io/pr-radar/).**
2. **[Create a token](https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar)** — that link
   pre-fills everything. Scroll down, press **Generate token**, and copy it.
   *(Only watching public repositories? You can untick every box.)*
3. **Paste it in, then add a repository** — type `facebook/react`, or just
   `facebook` to pull in the whole organisation at once.

That is the entire setup. The token stays in your browser tab and is sent to
nobody but GitHub. Close the tab and it is gone.

### Put it on your phone

It installs like an app, because it is one.

- **iPhone / iPad** — open the link in Safari, tap **Share**, then
  **Add to Home Screen**.
- **Android** — open the link in Chrome, tap the **⋮** menu, then **Install app**.
- **Desktop** — Chrome and Edge show an **install** icon in the address bar.

It then opens full-screen with its own icon, and starts instantly because the
app itself is cached. Your pull requests are never cached: those are always
fetched fresh, because a dashboard showing yesterday's state is worse than one
that says it is offline.

---

GitHub can already list pull requests. What it cannot do is tell you, across
every repository at once, which ones are actually waiting on **you** — so that
is what this is built around. The dashboard opens on *Needs my review*, not on
an undifferentiated list.

Clicking a pull request takes you to it on GitHub. This is deliberately not a
review client: there is no diff viewer, no comment box, no merge button. It is
the place you notice things, not the place you do them.

## What it is

- **One list, many repositories.** Add any repo you can see, from any owner or
  organisation. Each developer keeps their own list.
- **Three filter axes, one click each.** *Who* (mine, to review, I reviewed,
  involves me), *State* (awaiting review, approved, changes requested, CI
  failing, stale) and *Drafts* (shown, only, hidden). They are independent and
  combine, because "my PRs" and "changes requested" are different questions and
  the useful view is their intersection. Every chip carries a live count, and
  each count is measured against the *other* axes — with *Mine* selected,
  *Approved* answers "how many of mine are approved".
- **Dropdown menus built from the data.** Repository, Author, Label, Assignee
  and Reviewer work like GitHub's, with a search box once a list gets long — but
  the options are whoever actually appears in the fetched list, ranked by how
  often, and each option carries its count. They are also narrowed by the other
  filters, so a choice that would lead to an empty list is not offered.
- **Merge history, off by default.** Nothing closed is fetched until the Status
  axis asks for it — the everyday view costs one request per repository. *Merged*
  sorts by merge date, newest first, and a *Period* menu appears alongside it,
  defaulting to the past month.
- **Saved views for the rest.** Anything the axes and menus cannot express can
  be typed and saved as a named view with its own count.
- **GitHub's filter syntax.** `is:draft author:@me -label:wip` means here what
  it means there, so there is nothing new to learn.
- **No backend.** No server, no database, no account, no deployment to operate.
  The page talks to `api.github.com` directly and keeps your settings in your
  own browser.

## Running your own copy

You do not have to. [The hosted one](https://aryeborgen.github.io/pr-radar/) is
the same bundle, and since there is no backend there is nothing about it that is
"theirs" -- your token and your settings never leave your browser either way.

Run your own if you would rather serve it yourself. Every option below is the
same static bundle.

**As a command** — nothing to install:

```bash
npx pr-radar          # or: pnpm dlx pr-radar     bunx pr-radar
```

Serves the dashboard on `http://localhost:4173` and opens a browser. `--port`,
`--host` and `--no-open` are available; `--help` lists them.

**Docker** — if you would rather not have Node at all:

```bash
docker run -p 4173:80 ghcr.io/aryeborgen/pr-radar
```

Then open <http://localhost:4173>. Published for `amd64` and `arm64`, so it runs
on an Apple Silicon Mac, a Graviton instance or a Raspberry Pi without
emulation. From a clone, `docker compose up` does the same thing.

**From source** — needs Node 20 or newer:

```bash
git clone https://github.com/AryeBorgen/pr-radar.git
cd pr-radar
npm install
npm run dev
```

**On your own host:**

```bash
npm run build         # → dist/, a folder of static files
```

Serve `dist/` from anything -- GitHub Pages, Netlify, S3, nginx. When the site
lives under a path rather than at the root, build with `PR_RADAR_BASE=/that/path/`;
the included Pages workflow does it for you.

## Putting it inside something you already have

If you already run a dashboard, the radar can be a panel in it rather than
another tab to remember.

```bash
npm install pr-radar react react-dom
```

```js
import { renderRadar } from 'pr-radar/render'
import 'pr-radar/style.css'

const radar = renderRadar(document.querySelector('#radar'), {
  token,
  repos: [{ owner: 'octocat', name: 'hello-world' }],
})
```

That is the whole API. `renderRadar` returns a handle with `setRepos(repos)`,
for when the surrounding page decides what to show, and `destroy()`, for when it
goes away. React and react-dom are peer dependencies, so your copy is the only
copy.

It is a function rather than a component on purpose: a component only reaches
React, and a function reaches Vue, Angular and a plain HTML page too. From a page
with no build step, React arrives through an import map:

```html
<script type="importmap">
  { "imports": {
    "react": "https://esm.sh/react@19",
    "react-dom/client": "https://esm.sh/react-dom@19/client",
    "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime"
  } }
</script>
```

**It stores nothing.** The standalone page keeps a token in `sessionStorage` and
settings in `localStorage`; the embedded radar does neither, because a widget
that writes to storage in a page you did not write is a widget you cannot reason
about. The token you pass is used and forgotten. Every class name is prefixed
`pr:`, so the stylesheet cannot reach your markup and yours cannot reach it.

Four names are exported and nothing else: `renderRadar`, `RadarOptions`,
`RadarHandle` and `RepoRef`. The internals are free to change because they were
never promised -- which is what let the data layer move from GraphQL to REST
without anything outside one module noticing.

Bringing your own components, so the radar adopts your design instead of its own,
is the next piece of [#26](https://github.com/AryeBorgen/pr-radar/issues/26).

## The token

Whichever way you run it, the first screen asks for a
[personal access token](https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar).
Public repositories need no scopes at all; add `repo` for private ones and
`read:org` to expand an organisation into its repositories in one step.

## Signing in with a GitHub account

Where something is serving this that can relay two requests -- `npx pr-radar`,
or the container -- there is a **Sign in with GitHub** button above the token
field. You get a short code, type it at `github.com/login/device`, and that is
the whole thing.

It needs a GitHub App or OAuth App with device flow enabled, and its client id:

```bash
npx pr-radar --client-id Iv1.your_client_id
# or
docker run -p 8080:80 -e PR_RADAR_CLIENT_ID=Iv1.your_client_id ghcr.io/aryeborgen/pr-radar
```

A client id is **not a secret**. The device flow authenticates with the id
alone, which is exactly why a page can use it, and why nothing here holds a
credential of any kind. The relay parses no token, keeps no session and writes
nothing; the access token passes through to your browser, which is where a
pasted one lives too. And it runs on your own machine.

Two routes exist and nothing else. Each one's upstream is a constant in the
source, four body fields are forwarded after being matched against patterns, no
header from your request is passed on, and the reply is rebuilt from the fields
the flow needs. Every one of those is tested by attempting to get past it, and
the container and the CLI are asked the same questions and required to give the
same answers.

The hosted page on GitHub Pages has no server, so it has no sign-in. It says so
rather than showing a button that could not work.

## Why a token is still here

Signing in needs a relay, and a relay needs a server. That is measured rather
than assumed, on every test run: a real browser asking
`github.com/login/device/code` for a device code is refused outright, both as a
preflighted request and as a simple form POST that needs no preflight, because
GitHub sends no `Access-Control-Allow-Origin` on any of its OAuth endpoints.

So the token stays, and not as a fallback. It works on **every** deployment,
including the hosted page, which has no server to relay through. It needs no
GitHub App configured by anyone. And it is the only way in that involves no
third piece of software at all.

The trade-off is worth stating plainly, and it applies to both ways in:

- The token is kept in **`sessionStorage`**, so it is gone when the tab closes.
  It is never written to disk by this app and never sent anywhere except
  `api.github.com`.
- It is still a credential living in a browser tab. On a shared or untrusted
  machine, prefer a **fine-grained token** scoped to just the repositories you
  want to watch, with read-only permissions.
- Nothing about your repositories is ever transmitted to a third party, because
  there is no third party.

## Notifications

The bell in the header announces four things: a review requested from you, your
PR approved, changes requested on your PR, and CI failing on your PR. Each can
be switched off.

They arrive **while the tab is open**, and that is a limit of having no backend
rather than a choice: real push needs a server holding VAPID keys to send
through a push service. The tab title always shows how many pull requests are
waiting on your review, which works whether or not you granted permission.

Nothing is announced on first load, however much already matches — the first
pass establishes a baseline silently, and only a genuine transition after that
notifies. A pull request seen for the first time is baselined too, so adding a
repository does not produce a burst.

## Filter reference

| Qualifier | Values | Notes |
| --- | --- | --- |
| `is:` | `open`, `merged`, `closed`, `draft`, `ready` | `closed` means closed without merging |
| `draft:` | `true`, `false` | |
| `author:` | login or `@me` | |
| `assignee:` | login or `@me` | |
| `review-requested:` | login or `@me` | Reviews still outstanding |
| `reviewed-by:` | login or `@me` | Anyone who has already reviewed |
| `involves:` | login or `@me` | Author, assignee, requested reviewer or reviewer |
| `label:` | label name | Quote names with spaces: `label:"needs design"` |
| `repo:` | `owner/name` | |
| `org:` | owner login | |
| `review:` | `approved`, `changes-requested`, `required`, `none`, `unknown` | `unknown` = not fetched yet, which is not the same as `none` |
| `checks:` | `success`, `failure`, `pending`, `none`, `unknown` | `status:` is an alias |
| `no:` | `label`, `assignee`, `reviewer` | |
| `updated:` / `created:` / `merged:` / `closed:` | `<7d`, `>1mo`, `>2026-01-01`, `<=12h`, `>2w`, `>1y` | An age means *that long ago*, so `updated:<7d` is "untouched for over a week" and `closed:>1mo` is "closed within the last month". A month is 30 days, a year 365 |
| `sort:` | `updated-desc` (default), `updated-asc`, `created-desc`, `created-asc`, `merged-desc`, `merged-asc` | Unmerged PRs sort last under a merge-date sort |

Prefix any qualifier with `-` to negate it. Bare words match the title,
repository and number. Repeated qualifiers are OR'd (`author:a author:b` means
either), except `label:`, which is AND'd — the same as GitHub. A qualifier that
is not supported is listed under the filter box rather than silently ignored,
so a filter never quietly lies about what it matched.

### How the filter sources compose

Repeated qualifiers of one kind are OR'd to match GitHub, which is right within
a single query and wrong across a stack of filters: `is:open` from the Status
axis concatenated with `is:draft` from the Drafts axis would mean "open **or**
draft". So each source — every axis, every menu, the text box — is applied as
its own filter stage, narrowing the previous one, with a single sort at the end.
Picking an author from the menu therefore intersects with *Mine* rather than
widening it, and two authors picked in the *same* menu still mean either. The
sort comes from the last stage that names one, which is how the Sort menu
overrides the newest-first default that the *Merged* view carries.

### Drafts are shown by default

That is deliberate. Where a review bot moves a pull request back to draft on a
failed review, "draft" is a state worth seeing rather than noise to hide — so
the *Drafts* axis defaults to *Shown*, with *Only* one click away for triaging
exactly those.

## Why REST, and why the list fills in twice

GitHub's GraphQL API would answer all of this in one request, and it is the
obvious choice — right up until you call it from a browser. The GraphQL endpoint
sends no `Access-Control-Allow-Origin` header at all, so the CORS preflight
fails and `fetch` rejects before a request is ever made. No client-side change
fixes that; it would take a server to proxy, which is the one thing this app is
built to avoid. The REST API does support CORS, so everything here goes through
REST.

The cost is that REST's pull-request list omits two things the dashboard cares
about: whether a PR is approved, and whether its checks pass. Those are fetched
per pull request in a second pass, which is why the list appears immediately and
then fills in. While that is happening the filter bar says so, because a bucket
count that depends on data still in flight should not present itself as final.
State that has not arrived is `UNKNOWN`, which is deliberately distinct from
`NONE` — so `review:none` and `review:unknown` mean different things, and a
filter is never quietly wrong about a PR it has not finished loading.

## Limits

- 100 open PRs per repository per refresh, most recently updated first.
- One request per repository for the list, six at a time, plus two per pull
  request for review and check state.
- Closed pull requests cost a second request per repository and are fetched
  only when the Status axis asks for them, capped at one page of the 100 most
  recently updated per repository. Between that cap and the *Period* menu,
  whichever bites first wins: a month of history where a repository is busy, the
  last 100 where it is quiet. When a repository fills the page and its oldest row
  is still inside the period, the app says so rather than looking complete.
- The period is judged by when a PR *closed*, not when it was last updated.
  GitHub can only sort closed PRs by update time, so an old merge that was
  commented on yesterday arrives near the top of the page — and must still fall
  outside a one-month window.
- Only open pull requests are enriched with review and check state. On a merged
  PR that is history, and buying it would cost two requests each for a list
  that keeps growing.
- The second pass is cached by head SHA, so a refresh that finds nothing new
  costs no requests at all and a new commit re-fetches exactly one PR. That is
  what makes a two-minute poll affordable against the 5,000 requests/hour limit.
- Check state comes from check runs (GitHub Actions and other check-run apps).
  Legacy commit statuses are not read.
- A repository the token cannot see fails on its own and is reported by name;
  it does not blank the rest of the dashboard.

## Prior art

[`gh-dash`](https://github.com/dlvhdr/gh-dash) is the same idea in a terminal,
and its model of named sections built from search queries is the one adopted
here. [`gitdeck`](https://github.com/debba/gitdeck) covers far more ground
(GitLab, Forgejo, issues, CI, kanban) if you want a broader tool and do not
mind running a backend.

## License

MIT
