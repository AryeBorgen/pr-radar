# PR Radar

Every open pull request across all your repositories, on one screen.

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
- **Saved views as filter strings.** The tabs across the top are nothing but
  named queries. Type a filter, press *Save view*, and it becomes a tab with a
  live count.
- **GitHub's filter syntax.** `is:draft author:@me -label:wip` means here what
  it means there, so there is nothing new to learn.
- **No backend.** No server, no database, no account, no deployment to operate.
  The page talks to `api.github.com` directly and keeps your settings in your
  own browser.

## Running it

```bash
npm install
npm run dev
```

Then paste a [personal access token](https://github.com/settings/tokens/new?scopes=repo,read:org&description=PR%20Radar).
Public repositories need no scopes at all; add `repo` for private ones and
`read:org` to expand an organisation into its repositories in one step.

To build a static bundle you can host anywhere:

```bash
npm run build      # → dist/
```

## About the token

There is no "Sign in with GitHub" button, and that is a consequence of having
no backend rather than an oversight: exchanging an OAuth code requires a client
secret, and GitHub's token endpoint sends no CORS headers, so a page cannot do
it alone. A token you create yourself keeps the whole app deployable as static
files with no secret held anywhere.

The trade-off is worth stating plainly:

- The token is kept in **`sessionStorage`**, so it is gone when the tab closes.
  It is never written to disk by this app and never sent anywhere except
  `api.github.com`.
- It is still a credential living in a browser tab. On a shared or untrusted
  machine, prefer a **fine-grained token** scoped to just the repositories you
  want to watch, with read-only permissions.
- Nothing about your repositories is ever transmitted to a third party, because
  there is no third party.

## Filter reference

| Qualifier | Values | Notes |
| --- | --- | --- |
| `is:` | `open`, `draft`, `ready` | Only open PRs are fetched, so `is:merged` matches nothing |
| `draft:` | `true`, `false` | |
| `author:` | login or `@me` | |
| `assignee:` | login or `@me` | |
| `review-requested:` | login or `@me` | Reviews still outstanding |
| `reviewed-by:` | login or `@me` | Anyone who has already reviewed |
| `label:` | label name | Quote names with spaces: `label:"needs design"` |
| `repo:` | `owner/name` | |
| `org:` | owner login | |
| `review:` | `approved`, `changes-requested`, `required`, `none`, `unknown` | `unknown` = not fetched yet, which is not the same as `none` |
| `checks:` | `success`, `failure`, `pending`, `none`, `unknown` | `status:` is an alias |
| `no:` | `label`, `assignee`, `reviewer` | |
| `updated:` / `created:` | `<7d`, `>2026-01-01`, `<=12h`, `>2w` | An age means *that long ago*, so `updated:<7d` is "untouched for over a week" |
| `sort:` | `updated-desc` (default), `updated-asc`, `created-desc`, `created-asc` | |

Prefix any qualifier with `-` to negate it. Bare words match the title,
repository and number. Repeated qualifiers are OR'd (`author:a author:b` means
either), except `label:`, which is AND'd — the same as GitHub. A qualifier that
is not supported is listed under the filter box rather than silently ignored,
so a filter never quietly lies about what it matched.

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
