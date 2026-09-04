# PR Radar — brand assets

Four messages, sent in order, in one conversation. The first establishes the
character. The three after it each ask for one file and assume everything above.

---

## Message 1 — the character

> **PR Radar** is a dashboard for developers: every open pull request across all
> of someone's repositories on one screen, answering *which of these is waiting
> on me?* It is a static web page — no server, no account — opened in a browser
> tab and installable to a phone home screen.
>
> Its mascot is **a rover with a satellite dish for a head**. The name is radar,
> so the mark is radar: a dish, scanning, picking things up. The face turns an
> instrument into something that watches your pull requests for you.
>
> **The character.** A small, sturdy machine. Head one third, body two thirds.
> The head is a wide ellipse tilted about 20° — a dish seen at an angle, not a
> flat circle — with a darker crescent along its *lower* rim so it reads as
> concave. Two round dark eyes low on the dish, each with a small white highlight
> at the upper left. Then the feed arm, ending in a filled dot, with one or two
> pale mint arcs curving off it. A short neck. A body that is a generously
> rounded lozenge, wider than tall, no panel lines. Two thick short arms set low
> and hanging clear of the silhouette. Two small feet directly under the body,
> no legs.
>
> **The one piece of geometry that has to be right.** A dish is a circle seen at
> an angle, which is why it is drawn as an ellipse. The feed arm sits on the
> dish's axis — the direction it is pointing — and that axis, projected onto the
> page, is always **perpendicular to the ellipse's long axis**, starting at its
> **centre**.
>
> Draw it parallel to the long axis instead and it stops reading as an antenna
> standing out of the dish: it reads as a scratch lying flat across it. This is
> the single thing most likely to make the whole mark look wrong while every
> individual part looks fine, and it is what went wrong on the first attempt.
>
> So: if the dish is tilted 20°, the arm points at 20° + 90° — up and to the
> *left* of the tilt, not along it. A perpendicular arm is also **shorter** on
> the page, because it is angled towards the viewer, which is worth knowing
> before the icon's safe zone comes up.
>
> **Tone.** Quiet and precise. Warm, but a capable small machine doing a job —
> not a toy. No exclamation marks, nothing bouncy.
>
> **Palette**, and nothing else:
>
> ```
> #10b981  primary green      #a7f3d0  pale mint, arcs and highlights
> #059669  body fill          #ffffff  white
> #047857  shadow, arms       #04302b  eyes only
> #065f46  outlines
> ```
>
> A gradient for depth is fine. A gradient that is the only thing separating two
> elements is not — it collapses at small sizes.
>
> **This must be an original character.** Do not modify, trace or derive from
> GitHub's Octocat: it is a GitHub trademark and derivative works are not
> permitted. No cat, no tentacles.
>
> Draw the character and show me, before we cut any files.

---

## Message 2 — `icon.svg`

> Now the app icon and favicon. **The head only** — the body is unreadable at
> this size.
>
> SVG, `viewBox="0 0 64 64"`, square, **opaque background edge to edge**. Do not
> draw rounded corners: every platform applies its own mask, and a radius in the
> file shows as a double edge.
>
> Green gradient tile. The dish in **white**, not green — white is what keeps it
> legible against both a white and a near-black browser tab strip. Eyes and sweep
> in `#047857`. **One** arc only; two merge into a smudge at 16px. Draw the arc
> before the dish so the dish overlaps it and they read as one object.
>
> **The antenna has to leave the dish**, and this is what the first icon got
> wrong: its sweep stopped at 7.2 where the dish's half-height was 11, and the
> dot reached only 10, so the whole assembly sat *inside* the dish. It read as a
> third eye rather than an antenna, and the arc floated above with nothing
> joining it to anything.
>
> Take the proportions from the mascot, where this works. Against the dish's
> half-height `ry`:
>
> ```
> sweep runs from the centre out to the rim        -> length = ry
> antenna dot sits on the rim, radius ~0.26 x ry   -> it pokes clearly outside
> first arc at ~1.2 x ry, second (if any) at ~1.4 x ry
> ```
>
> Also make the antenna dot **visibly different from the eyes** — larger, or
> ringed, or a lighter colour. Three dark circles of the same size read as a
> face, whatever the geometry says.
>
> **The hard constraint.** Android crops this to a circle, a squircle or a
> teardrop, taking **up to 20% off every edge**. The safe region is the centred
> circle of **diameter 40 in the 64-unit box** — within 12 units of every edge.
>
> The rule applies to **features, not to the silhouette**. The dish itself may
> run past that circle and out to the tile edges; a dish cropped at its rim looks
> deliberate, the way any full-bleed mark does. What must stay inside are the
> parts that mean something and look broken when they are missing: **the eyes,
> the sweep, the antenna dot and the arcs**.
>
> So make the dish large — 70–80% of the tile width — and keep the antenna
> assembly within the ring.
>
> The last two attempts both failed here, the same way: the antenna dot near
> `(45, 22)` and the arc running out past `(54, 10)` are both outside the ring,
> so a phone sliced them off. **There is no error when this happens** — the icon
> just looks broken, on some devices only.
>
> Do not fix it by shrinking everything towards the middle; that gives a small
> mark floating in green, which is worse. And do not fix it by swinging the arm
> to a friendlier angle — the arm is perpendicular to the dish's long axis and is
> not free to move on its own. **The dish's tilt is the only control**, and
> rotating the dish rotates the arm with it. Keep the head filling 70–80% of the
> tile.
>
> Note that a perpendicular arm is already short on the page, so this is a much
> smaller problem than it was when the arm was drawn lying along the dish.
>
> Also: minimum stroke 2.5 units, at most three distinct shapes, no text.
>
> Before you send it: render it at **16 real pixels** and look. Then inscribe a
> circle touching all four edges, crop to it, and look again.

---

## Message 3 — `mascot.svg`

> Now the full character, for the README and anywhere above 48px.
>
> SVG, **transparent background**, with the `viewBox` **tight to the artwork** —
> no empty margin, and no fixed `width`/`height`, so whoever places it controls
> its size and spacing. It is taller than it is wide; do not pad it into a
> square.
>
> No safe zone — this is never masked, so limbs and arcs may reach the edges.
> Head in green here rather than white, with the `#065f46` outline. Two arcs,
> since there is room.
>
> **No ground shadow, and nothing else standing in for a floor.** The file is
> transparent and gets placed on dark backgrounds as often as light ones, where a
> soft grey ellipse under the feet becomes a smudge hanging in mid-air.
>
> **The dish should be at least as wide as the body.** It is the element that
> says *radar*; when the body is wider, small sizes turn into a green blob with a
> sliver on top and the identifying part is the part that goes first.
>
> **The thing that goes wrong is proportion.** The previous version had thin arms
> set too high, a body too tall for its head, and feet too small — at 48px it was
> a smudge with a plate on top.
>
> Render it at 48px on white and on dark, and squint. The silhouette alone should
> say *small robot*. If the arms merge into the body outline, thicken them and
> move them further out.

---

## Message 4 — `social.png`

> Last one: the link preview card, shown when the repo is pasted into Slack or
> found in search.
>
> PNG, **1280 × 640 exactly**, opaque, background `#0b1220`.
>
> Two columns. Left third: the mascot, full body, about 320px tall, vertically
> centred. Right: three lines, left-aligned, centred as a block —
>
> 1. **PR Radar**, bold white, ~84px
> 2. *Every open pull request across all your repositories, on one screen.* —
>    ~36px in `#a7f3d0`, wrapping to two lines
> 3. *No backend · no database · bring your own repos* — ~26px, muted grey
>
> A clean humanist sans. Nothing condensed, nothing decorative.
>
> Platforms crop this to different ratios and often show it at a third of its
> size: keep everything that matters **within 80px of every edge**. Check it at
> 400px wide — the title should still be comfortable.

---

## Deliver

```
icon.svg      64x64 viewBox, opaque, head only
mascot.svg    tight viewBox, transparent, full body
social.png    1280x640, opaque
```

**Nothing else — no PNG sizes.** Rendering the mascot at a few sizes to check it
is exactly the right thing to do, but those renders are a proof, not an asset:
kept in the repository they are seven files that fall out of step the moment
anyone touches the source. Every shipped size is generated from these:
`icon-192`, `icon-512`, `icon-maskable-192`, `icon-maskable-512`,
`apple-touch-icon` (180), `favicon-32`, `favicon.ico`, and the SVG itself as the
vector favicon.

Automated tests confirm every icon is served, is a PNG, and is the size it
claims. **They cannot see a mark that is illegible at 16px or cropped by a
phone.** That is what the two checks above are for.
