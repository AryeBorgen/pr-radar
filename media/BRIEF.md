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
> at the upper left. A thick sweep line from the dish's centre out to its rim,
> ending in a filled dot: the radar sweep and the antenna in one stroke. One or
> two pale mint arcs curving off that dot. A short neck. A body that is a
> generously rounded lozenge, wider than tall, no panel lines. Two thick short
> arms set low and hanging clear of the silhouette. Two small feet directly under
> the body, no legs.
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
> **The hard constraint.** Android crops this to a circle, a squircle or a
> teardrop, taking **up to 20% off every edge**. Everything that carries meaning
> must sit inside the centred circle of **diameter 40 in the 64-unit box** —
> within 12 units of every edge. Outside that ring, background only.
>
> The last two attempts both failed here, the same way: the antenna dot near
> `(45, 22)` and the arc running out past `(54, 10)` are both outside the ring,
> so a phone sliced them off. **There is no error when this happens** — the icon
> just looks broken, on some devices only.
>
> Do not fix it by shrinking everything towards the middle; that gives a small
> mark floating in green, which is worse. Fix it by **choosing an angle for the
> sweep that has room** — point it up-left, or shorten it — and keep the head
> filling 70–80% of the tile.
>
> Also: minimum stroke 2.5 units, at most three distinct shapes, no text.
>
> Before you send it: render it at **16 real pixels** and look. Then inscribe a
> circle touching all four edges, crop to it, and look again.

---

## Message 3 — `mascot.svg`

> Now the full character, for the README and anywhere above 48px.
>
> SVG, `viewBox="0 0 64 64"`, **transparent background**. No safe zone — this is
> never masked, so limbs and arcs may reach the edges. Head in green here rather
> than white, with the `#065f46` outline. Two arcs, since there is room.
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
mascot.svg    64x64 viewBox, transparent, full body
social.png    1280x640, opaque
```

Nothing else. Every shipped size is generated from these:
`icon-192`, `icon-512`, `icon-maskable-192`, `icon-maskable-512`,
`apple-touch-icon` (180), `favicon-32`, `favicon.ico`, and the SVG itself as the
vector favicon.

Automated tests confirm every icon is served, is a PNG, and is the size it
claims. **They cannot see a mark that is illegible at 16px or cropped by a
phone.** That is what the two checks above are for.
