# Changelog

What changed between versions, for somebody deciding whether to upgrade.

The releases on GitHub carry the full commit list. This carries the part worth
reading: what is different, and whether anything you depend on moved.

**Nothing has broken yet.** Every version so far only added to the published
surface — no export has been removed or changed shape since `pr-radar/render`
first appeared in 0.2.0. That is not a promise until 1.0.0, and the version
badge is orange to say so.

## 0.6.1 — 2026-09-08

**Fixed: reaching the dashboard from another device gave a blank page and said
nothing.** Starting it with `--host 0.0.0.0` and opening the machine's address
from a phone rendered an empty window. The cause was this project's own
Content-Security-Policy: `upgrade-insecure-requests` rewrites every asset request
to `https`, there is no certificate on a plain address, and each one fails the
handshake — so the document arrives referencing nothing that loads. Nothing in a
browser explains that. It now says so when it binds anywhere but loopback, and
points at what actually works: https, through a Tailscale name or a tunnel.

Only `npx pr-radar` is affected — the container serves through nginx, and the
hosted page is unchanged. Nothing else moved: this release builds a
byte-identical application bundle to 0.6.0.

## 0.6.0 — 2026-09-06

**The dashboard on a phone.** The filters took 715 of an 844-pixel screen, so
85% of a phone was spent scrolling past chrome to reach the first pull request.
The axes, the menus and the saved views now sit behind one control below `sm` —
one rather than three, because collapsing each separately gives a phone three
buttons that each hide a third of the answer. That control names *what* is
filtering rather than counting it: with the axes hidden it is the only place
that state is visible, and a filter you set and forgot would otherwise make the
page a liar. Down to about a quarter of the screen; five pull requests where
four fit. The query box stays out in the open, and the desktop layout is
untouched.

**Copy the code and continue to GitHub**, in one press, when signing in with a
GitHub account. The page says whether the copy actually happened — a clipboard
write can be refused, and a button that silently did nothing is worse than no
button when the tab it just opened is asking for a code you believe you are
holding. The code stays on screen and selectable either way.

**Fixed: one long word made the whole page wider than the screen.** A pull
request title is somebody else's text — a branch name, a package path, a pasted
URL. A token that could not break set the row's width, the row set the page's,
and the dashboard had to be dragged sideways to be read: 186 pixels past a
440-pixel phone, from two titles.

**Fixed: two paragraphs of English on a Hebrew page** — the note about review
and CI state still arriving, and the one about closed pull requests being capped
at a hundred per repository. The check that exists to catch exactly this reads
text between tags with braces excluded, so a sentence with a count in the middle
of it matched nothing at all — which is the shape of every sentence with a count
in the middle of it. It punches interpolations out to a placeholder now, and
named both immediately.

**Added:** `<meta name="mobile-web-app-capable">`, alongside the `apple-`
prefixed one that was already there. They are not interchangeable: Safari reads
one, Chrome reads the other and warns that the first is deprecated. The manifest
remains the real mechanism; these are the fallback.

*Nothing was added to or removed from the published types.*

## 0.5.0 — 2026-09-05

**Knowing it is working.** A first load is around three hundred requests and the
screen said nothing about it. A two-pixel line now crosses the top while there is
work to report, driven by counts that already existed — repositories that have
answered, pull requests whose review state has arrived. No extra request feeds
it. It does not appear for a background refresh that finds nothing, and it moves
nothing else on the page.

**A session that renews itself.** An OAuth App set to expire its tokens used to
look like it worked and then sign the user out mid-afternoon with a `401`. The
refresh was modelled and never performed. It is performed now, before expiry,
with the new refresh token used next time rather than the spent one — and a
refused refresh signs you out rather than leaving you holding a token that is
about to stop working.

**The hosted page can sign in.** GitHub Pages has no server to relay the OAuth
exchange through, so it showed the token field alone. A stateless worker now
relays it. See *Running your own copy* in the README for what that means for
where your token goes — it is the one part of this worth reading before you use
it.

## 0.4.0 — 2026-09-05

**Wearing your design.** `renderRadar` takes a `components` option: `Button`,
`Chip`, `Avatar`, `Link`, `Input` and `Row`, all optional. `Row` receives the
row's parts already rendered — `title`, `meta`, `badges`, `trailing`, `actions` —
rather than the pull request they describe, so a host never takes a dependency on
how this project models one.

*Added to the published types:* `RadarComponents`, `ButtonProps`,
`ButtonVariant`, `ChipProps`, `ChipTone`, `AvatarProps`, `LinkProps`,
`LinkVariant`, `InputProps`, `RowProps`. All of them are primitives and
`ReactNode`; none names an internal type.

**Fixed:** eight Tailwind classes had lost their `pr:` prefix, every one in a
`selected` branch — so the highlighted filter pill was not highlighted at all.
An unprefixed class matches nothing, silently, and every one of them was a state
a screenshot does not usually show.

## 0.3.0 — 2026-09-04

**Sign in with a GitHub account**, wherever the deployment can relay it —
`npx pr-radar` and the container both can, from your own machine. The token
field stays on every deployment and needs nothing configured anywhere.

**Hebrew, right to left.** Chosen from your browser, changeable, remembered.
Plural forms and dates go through the platform's own `Intl`, which knows that
two of something in Hebrew takes its own word.

**Merge and close from the row**, one pull request at a time. Nothing happens on
the first click: the menu opens, and the destructive item opens a confirmation
naming the repository and the number. There is no bulk merge.

## 0.2.0 — 2026-09-04

**The dashboard became embeddable.** `renderRadar(element, { token, repos })`
mounts it into any element, from any host — imperative rather than a component,
so it reaches Vue, Angular and a plain HTML page. A plain page supplies React
through an import map; a page with a bundler needs nothing.

*The published surface:* `renderRadar`, `RadarOptions`, `RadarHandle`,
`RepoRef`. Everything else stays internal, deliberately.

**Fixed:** the bundle referenced `process.env.NODE_ENV`, a Node global, and
threw `process is not defined` in any page without a bundler — which is the
exact case an imperative function exists to serve. The emitted `.d.ts` also
imported `./types` without an extension and imported a stylesheet, neither of
which a consumer on `moduleResolution: nodenext` can resolve.

## 0.1.1 — 2026-09-04

The first release published through CI, with provenance. `0.1.0` was published
by hand and carries none.

## 0.1.0 — 2026-09-04

First release. The dashboard, the filter language, the three filter axes, saved
views, notifications, the Docker image and `npx pr-radar`.

**Published by hand, and it cannot be reproduced.** Its JavaScript matches a
build of `b76d04d` byte for byte; its stylesheet carries a rule no clean
checkout of that commit produces, because it was packed from a working tree a
failed build had left half-written. Every release from 0.1.1 comes from a fresh
checkout in CI. Prefer any later version.
