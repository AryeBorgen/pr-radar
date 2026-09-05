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
pr-radar             the CLI, unchanged
pr-radar/render      renderRadar, one function
pr-radar/style.css   the compiled stylesheet
```

Separate packages would each need their own trusted publisher configured by hand
on their own npm page, their own release job and their own provenance check --
multiplying a pipeline that currently works once and is verified. They would also
introduce version skew between `pr-radar-react@2` and `pr-radar-core@1`, which is
a support burden with no user on the other end of it.

The argument for splitting is that a consumer of one entry point downloads the
others. Measured: the whole library is about 100 kB of source, in a package that
already ships 472 kB, 128 kB of which is two images. It is not a consideration.
**Adding an entry point later is one line in `exports`**, so nothing here
forecloses the split if it ever earns its place.

## What is not exported, and why that is the whole design

Everything except one function.

An earlier draft of this document listed a `pr-radar/core` entry point with
twenty-five functions and sixteen types: the filter language, the rollups, the
facet axes, the menu builders. It was justified on the grounds that the code is
already pure and already tested, so exporting it costs nothing.

That is true of the code and false of the contract. **Adding an export later is a
minor release; removing one is a breaking change.** The asymmetry is the whole
argument for starting with less than seems reasonable.

### The filter cannot be exported without freezing `PullRequest`

Measured rather than assumed: `filter.ts` reads **sixteen of the nineteen fields**
on `PullRequest`. The three it does not -- `id`, `url`, `headSha` -- are exactly
the ones any interface needs anyway, so there is no narrower type to publish in
its place. Exporting the filter means exporting the shape.

And that shape is precisely what `CLAUDE.md` protects. It is what changed when
the data layer moved from GraphQL to REST, in a rewrite that touched one module
because nothing outside depended on it. Publishing it ends that.

### So the first version exports one function and the types it needs

```ts
renderRadar(element: Element, options: RadarOptions): RadarHandle

interface RadarOptions { token: string; repos: RepoRef[] }
interface RadarHandle { setRepos(repos: RepoRef[]): void; destroy(): void }
interface RepoRef { owner: string; name: string }
```

Four names. `PullRequest`, the filter language, the axes, the menus and every
component stay internal and stay changeable.

If somebody asks for the filter engine, it can be added -- and by then there will
be a stated use for it, which is a better basis for a public type than the
observation that the code happens to be tidy.

## What `pr-radar/render` exports

One function.

```js
import { renderRadar } from 'pr-radar/render'
import 'pr-radar/style.css'

const radar = renderRadar(element, { token, repos })

radar.setRepos([{ owner: 'acme', name: 'web' }])
radar.destroy()
```

Not a component library. The whole contract is an element, a token, a list of
repositories and a handle back -- which means the components, the hooks, the prop
shapes and React itself all stay free to change, and the freezing cost this
document opens with is very nearly avoided rather than merely accepted.

It is also imperative, so it works from Vue, from Angular and from a plain HTML
page. That removes the web component from the plan entirely: it existed only to
reach non-React hosts, it has the narrowest API of the three options, and it is
the hardest to theme.

**With one qualification, found by building it.** React is left to the host --
bundling it would put two copies in one page, which is the classic way to make
hooks throw -- so the built module imports `react` as a bare specifier. A host
with a bundler resolves that already; a plain page needs an import map saying
where React is. That is three lines in the page, and `tests/embed.spec.ts` mounts
it exactly that way rather than describing it.

**`destroy` is not optional politeness.** Without it the radar cannot be removed
from a single-page application without leaking a React root, a poll and a
notification subscription. Once a handle is being returned, `setRepos` costs
almost nothing and answers the obvious next question -- showing the radar already
narrowed to whatever the host's user just clicked.

### Why the options are an object

`renderRadar(element, options)` rather than `renderRadar(element, token, repos)`,
and the reason is a feature that does not exist yet.

The intended next step is for a host to supply its own components, so the radar
adopts that application's design rather than bringing its own:

```js
renderRadar(element, { token, repos, components: { Row, Chip, Button } })
```

**Built, with one correction to the sketch above.** `Row` does *not* receive the
pull request. It receives the row's parts already rendered -- `title`, `meta`,
`badges`, `trailing`, `actions`, plus `state` and `draft` as plain strings --
because a slot taking a `PullRequest` would publish `PullRequest`, and that is
the type this entire document argues for keeping private. A host arranges the
pieces; it never learns their shape.

With an options object that is a new optional key -- a minor release, nothing
breaks. With positional arguments it is a third parameter grafted on beside two
others, and every future addition makes the signature worse. **The shape is
chosen now for a change that lands later**, which is the only reason it looks
like more ceremony than two arguments need.

Nothing else is exported from here. `TokenGate`, `Welcome` and `RepoManager` stay
internal: a host embedding this already knows who its user is and which
repositories matter, and would be actively harmed by a component that writes to
`sessionStorage` behind its back.

## Types

For a published library the declarations *are* the contract. A wrong `.d.ts` is
worse than none, because it is confidently wrong: the consumer's editor and their
build both agree with it, and nothing disagrees until run time.

Nothing is published today -- there is no `types` field and no `declaration`
emit. The starting point is better than that sounds: `strict`, `isolatedModules`
and `verbatimModuleSyntax` are already on, and there is **not one `any`** in the
modules that would be exported.

### Raise the compiler first, because it is nearly free

Measured against the modules due for export, rather than guessed:

| Flag | Errors it surfaces |
|---|---|
| `noUncheckedIndexedAccess` | **7** |
| `exactOptionalPropertyTypes` | 1 |
| `noPropertyAccessFromIndexSignature` | 1 |

Nine fixes in total, and the seven are the interesting ones: every place the code
reads an index that might not exist. `github.ts` destructures a `Promise.all`
into `[open, closed]` where `closed` is genuinely optional, and the compiler has
been letting that through. That is tolerable in an application whose inputs it
controls and not tolerable in a library, where the caller supplies the data.

### The declarations are emitted and mapped per entry point

```json
"exports": {
  "./render": { "types": "./dist/render.d.ts", "import": "./dist/render.js" },
  "./style.css": "./dist/pr-radar.css"
}
```

### The types are tested, not assumed

Four checks, because each catches something the others cannot:

- **`publint`** -- packaging correctness. Whether `exports` resolves, whether the
  files it names are actually in the tarball, whether the entry points work.
- **`@arethetypeswrong/cli`** -- whether the types *resolve* from every module
  system a consumer might use. The classic failure is a package that type-checks
  perfectly in the repository and resolves to `any` in somebody's project because
  one field in `exports` is in the wrong order.
- **Type-level tests**, with `expectTypeOf` from vitest, asserting the shape of
  the public signatures. `renderRadar` returns a handle with `destroy` and
  `setRepos` and nothing else; `parseQuery` takes a string and returns a
  `ParsedQuery`. These fail at type-check time, which is where a broken contract
  should fail.
- **A checked-in snapshot of the emitted declarations.** `dist/render.d.ts` is
  committed and compared on every build.

That last one is the important one. The export-surface test above catches a new
*name* appearing; the snapshot catches a changed *shape* -- a field turning
optional, a return type widening, a parameter gaining a union member. **Freezing
the contract is the cost this document opens with, so the contract should be
something you can see in a diff** rather than something you discover after
publishing.

### No `any` reaches the surface

There is none today. A check keeps it that way: the emitted declarations are
searched for `any`, and the build fails if one appears. An `any` in a `.d.ts` is
a hole in the contract that nothing else in this list would notice.

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

- **The prefixed build renders identically to the app.** The same browser tests,
  run against a page that calls `renderRadar` rather than against the app.
- **A host with its own Tailwind is unharmed.** A browser test mounting the radar
  inside a page that defines a conflicting `.flex`, asserting both keep their own
  layout.
- **`destroy` leaves nothing behind.** Mount, destroy, and assert the element is
  empty, the poll has stopped and no listener survives. This is the one that
  decides whether the library is usable in a single-page application at all, and
  it is invisible until somebody's tab has been open for an hour.
- **The public surface is exactly four names.** A test that imports the package
  and compares its exported names against a checked-in list, so widening the
  contract is a deliberate edit rather than a side effect. This is the check that
  keeps `PullRequest` from leaking out through a return type.
- **It works from a host that is not React.** A browser test mounting it from a
  plain HTML page, since that reach is the whole argument for an imperative
  function over a component.

## Order

0. Raise the compiler -- `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` -- and fix
   the nine errors. Before anything is exported, because the point of doing it is
   to fix them in private rather than in a contract.
1. `renderRadar`, its declarations, the prefixed stylesheet, the export-surface
   test, the declaration snapshot, `publint` and `attw`, the collision test and a
   mount-and-destroy test that asserts nothing is left behind.
2. `components` in the options, once there is a host whose design it has to
   adopt. The option object exists from day one so that this is additive.
3. The filter engine, if somebody asks for it. Not before: exporting it freezes
   the shape of `PullRequest`, and "the code is already tidy" is not a use.

No web component. `renderRadar` already reaches every host one would have
reached, with a wider API and less to maintain.
