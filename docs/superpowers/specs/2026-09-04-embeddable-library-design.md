# Embedding PR Radar in an existing application

The dashboard is a static page today, distributed three ways: a hosted URL, a
container, and `npx pr-radar`. All three run it as the whole page. This describes
publishing it as something you can put *inside* an application you already have.

## What this has to be worth

The measurements that shaped the design, taken rather than assumed:

- **Every module in `src/lib` is already pure.** No imports outside the project
  except React, and that only in the two hooks. The filter language, the review
  and check rollups, the facet axes and the notification transitions have 82
  unit tests between them and no dependencies to carry into a host.
- **The components already take props and nothing else.** None of them fetches,
  and none imports `@tanstack/react-query`. `App.tsx` owns all eleven pieces of
  state and passes results down. That is close to a library boundary by
  accident, and it is what makes this cheap.
- **The obstacle is CSS.** 127 `className` attributes of Tailwind utilities, plus
  a `@theme` block. Shipping those compiled means shipping `.flex` and `.mt-2`
  into somebody else's page.

## The cost that has to be stated first

`CLAUDE.md` opens by saying the boundary around `src/lib/github.ts` is the most
valuable thing in the codebase: it is why replacing the entire data layer changed
one module. **Publishing an interface freezes it.** Once `PullRequest` is an
exported type, adding a field is a minor release and changing one is a breaking
change, and the freedom that let GraphQL become REST is gone for anything
exported.

That is not a reason to refuse. It is the reason to export as little as possible
and to be deliberate about which side of the line each thing sits on.

## Shape

**One package, subpath exports.** Not `pr-radar-react` beside `pr-radar-core`.

```
pr-radar            the CLI, unchanged
pr-radar/core       the pure logic
pr-radar/react      the components
pr-radar/style.css  the compiled stylesheet
```

Separate packages would each need their own trusted publisher configured by hand
on their own npm page, their own release job and their own provenance check --
multiplying a pipeline that currently works once and is verified. They would also
introduce version skew between `pr-radar-react@2` and `pr-radar-core@1`, which is
a support burden with no user on the other end of it.

The argument for splitting is that a consumer of `core` downloads the React code
too. Measured: core and the components are about 100 kB of source, in a package
that already ships 472 kB, 128 kB of which is two images. It is not a
consideration. **Adding `pr-radar/vue` later is one line in `exports`**, so
nothing here forecloses the split if it ever earns its place.

## What `pr-radar/core` exports

Pure functions with tests already written. No React, no fetch, no storage.

```ts
// The filter language
tokenize, parseQuery, filterQuery, applyQuery, applyStages, sortPrs

// The rollups, which are pure despite living in github.ts
decideReview, rollupChecks

// The axes
FACETS, DEFAULT_SELECTION, needsClosed, combine,
selectionStages, selectionQuery, facetCounts

// The menus
MENUS, PERIOD_OPTIONS, DEFAULT_PERIOD, SORT_OPTIONS,
periodQuery, menuOptions, menuStages, toggle

// Types
PullRequest, Actor, Label, ReviewDecision, CheckState, PullState,
RepoRef, SavedView, Term, ParsedQuery, SortKey, Selection,
Facet, FacetOption, MenuSpec, MenuOption, MenuSelection
```

That list is longer than it first looked, and each name on it is a promise. It
was written by reading the modules rather than from memory, which is how
`buildMenus` -- a function this document invented and which does not exist --
came out of it.

`fetchPullRequests` and `fetchEnrichment` are **not** exported. They are the
boundary the architecture rests on, and a host that wants them can call
`api.github.com` itself -- there is nothing secret in two REST calls. Exporting
the *normalised type* without the fetcher is the deliberate half: it lets somebody
map their own data into the shape the engine understands without freezing how we
get ours.

## What `pr-radar/react` exports

Two levels, because a host wants one or the other and rarely both.

**The whole thing, as one component.** For a host that wants the dashboard on a
page and no decisions:

```tsx
<PrRadar token={token} repos={[{ owner: 'acme', name: 'web' }]} />
```

It owns its own state and asks the host for nothing but a token and a list of
repositories.

**The pieces, for a host that wants to arrange them itself.** `FacetBar`,
`FilterBar`, `FilterMenus`, `PrRow`, `SavedViews` -- each already a pure
presentational component -- plus the hook that produces what they need:

```tsx
const radar = usePrRadar({ token, repos })
// radar.pullRequests, radar.counts, radar.selection, radar.setSelection
```

Extracting `usePrRadar` from `App.tsx` is the only real refactor in this work.
App becomes a thin caller of it, which is a structural improvement whether or not
anybody embeds anything.

`TokenGate`, `Welcome` and `RepoManager` are **not** exported. They are onboarding
for a standalone page; a host that embeds this already knows who its user is and
which repositories matter, and would be actively harmed by a component that
writes to `sessionStorage` behind its back.

## Styling

Tailwind v4 takes a prefix at import:

```css
@import 'tailwindcss' prefix(pr);
```

Every utility and every custom property is namespaced -- `pr:flex`,
`--pr-color-canvas` -- which is the case Tailwind's own documentation names for
distributing a component library. The host cannot collide with us and we cannot
collide with the host.

**Theming is by custom property, not by class.** The `@theme` block already
declares the palette as variables, so a host restyles by redeclaring them:

```css
.my-page { --pr-color-canvas: #0d1117; --pr-color-ink: #e6edf3; }
```

The stylesheet ships compiled and is imported explicitly. Nothing is injected at
runtime: a library that appends a `<style>` tag to somebody else's document is a
library that cannot be unloaded.

## What has to be true before this ships

- **The prefixed build renders identically to the app.** The same 37 browser
  tests, run against a page that imports the library rather than the app.
- **A host with its own Tailwind is unharmed.** A browser test mounting the
  library inside a page that defines a conflicting `.flex`, asserting both keep
  their own layout.
- **The public surface is exactly the list above.** A test that imports the
  package and compares its exported names against a checked-in list, so widening
  the contract is a deliberate edit rather than a side effect.
- **`core` carries no React.** A test asserting the core entry point has no
  dependency on react, so it stays usable from a script or a server.

## Order

1. `pr-radar/core` and the export-surface test. No refactor; the code is already
   pure. Immediate value, no risk to anything.
2. `usePrRadar` extracted from `App.tsx`, with the app rewritten on top of it and
   the existing tests unchanged as the proof.
3. `pr-radar/react`, the prefixed stylesheet, and the collision test.
4. A web component only if a host appears that is not React. It is the narrowest
   API of the three and the hardest to theme, which is the opposite of what was
   asked for here.
