# Cordle Paint — Paint-to-Match Mode (Design Spec)

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan

## Summary

A second page, `paint.html` (deployed at `cordle.pages.dev/paint`), companion to
the existing subset game. The player sees a target color and a marked spot on a
paintable canvas. They load a pigment from a fixed limited palette and paint
**wet-into-wet** to mix the right color under the spot, then press **Lock in** to
sample that spot and be scored on how close it is. It demonstrates "how an artist
mixes" by letting the player physically build the color on the canvas.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Canvas | A real 2D `<canvas>`, drag to paint. |
| Match judging | Sample the color under a fixed **target spot** (small averaged disk). |
| Brush | Wet-into-wet blending, with **brush size** and **flow** controls. |
| Palette | Fixed limited palette every round; target is a random **reachable** mix. |
| Packaging | Separate page `paint.html` (own embedded Mixbox copy), cross-linked with `index.html`. |
| Win/scoring | Manual **Lock in** button; scored on closeness; track best %. |
| Undo | None. **Clear canvas** is the reset. |

## Core technical idea: accumulate in latent space

Re-running Mixbox against each pixel's current RGB on every brush move is slow
and lossy (repeated RGB↔latent round-trips). Instead the canvas stores, per
pixel:

- **`accum`** — a 7-float latent vector = weighted sum of deposited pigment latents.
- **`weight`** — total deposited weight.

A dab at flow `f` with brush falloff `a` deposits weight `w = f * a`:
```
for i in 0..6:  accum[p*7 + i] += w * pigmentLatent[i]
weight[p] += w
```
The pixel's displayed color is `mixbox.latentToRgb(accum[p] / weight[p])`
(paper white where `weight[p] == 0`). Each palette pigment's latent is
precomputed once via `mixbox.rgbToLatent`. A stroke is therefore float adds plus
one `latentToRgb` per touched pixel — fast — and a weighted latent average **is**
the paper's pigment mixing, so layering yellow over blue genuinely yields green.

This makes targets provably reachable: the target is itself a convex combination
of the palette's pigment latents, and on-canvas accumulation produces exactly
such convex combinations.

## Palette and target

Fixed limited palette (real Mixbox pigment RGBs):

- Cadmium Yellow `254,236,0`
- Cadmium Red `255,39,2`
- Ultramarine Blue `25,0,89`
- Titanium White `243,243,243`
- Ivory Black `0,0,0`

Target generation (`generateTarget(palette, rng, mixbox)`):
1. Draw a non-negative weight per pigment (e.g. `rng()^2` for spread), normalize.
2. Require at least 2 pigments with weight ≥ 0.15 (re-draw otherwise) so the
   target is never a trivial pure pigment.
3. Mix: `targetLatent = Σ wᵢ · pigmentLatentᵢ`; `targetRgb = latentToRgb(targetLatent)`.

Returns `{ weights, rgb }`. Only `rgb` is shown to the player.

## Brush and canvas

- Canvas size 420×420 (logical pixels; CSS-scaled responsively, painting math in
  logical pixels).
- Background: paper white (visual). Unpainted pixels read white.
- Controls:
  - **Pigment** — palette buttons; selecting one loads the brush.
  - **Brush size** — radius slider (e.g. 4–40 px).
  - **Flow** — slider 0.05–1.0 (deposited weight per dab at brush center).
- Falloff across the brush: `a = max(0, 1 - dist/radius)` (soft edge).
- Painting: pointer down + drag deposits dabs along the path (interpolate between
  successive pointer positions so fast strokes stay continuous).
- **Target spot:** a fixed marker (e.g. canvas center) with a ring overlay. The
  sampled color is the latent-averaged color over a small disk (sampleRadius ≈ 6 px).
- Buttons: **Clear canvas** (zero the buffers), **Lock in** (score), **New target**.

## Scoring

- **Lock in:** sample the spot color, compute match % using the existing
  `engine.js` color functions (`matchPercent`, which is CIELAB ΔE76-based),
  display the result with a tier label (e.g. ≥98 "Nailed it!", ≥90 "Great",
  ≥75 "Close", else "Keep mixing").
- Track **best match %** in `localStorage` (key `cordle-paint-best`).
- **New target** generates a fresh target and clears the canvas.

## Code structure

New source files (built into `paint.html` by the existing `build.js`):

- `src/paint-engine.js` — pure, DOM-free UMD module (Node-testable):
  - `pigmentLatents(palette, mixbox) -> number[][]` (one 7-float latent per pigment)
  - `createBuffer(w, h) -> { w, h, accum: Float32Array, weight: Float32Array }`
  - `addDab(buf, cx, cy, radius, flow, pigmentLatent)` — mutates buffer
  - `colorAt(buf, x, y, mixbox) -> [r,g,b]` (white if unpainted)
  - `sampleSpot(buf, cx, cy, sampleRadius, mixbox) -> [r,g,b]`
  - `generateTarget(palette, rng, mixbox) -> { weights, rgb }`
  - `clearBuffer(buf)`
- `src/paint-ui.js` — canvas rendering, pointer handling, controls, scoring,
  localStorage. Uses globals `window.mixbox`, `window.CordleEngine`
  (for `matchPercent`), `window.CordlePaint` (the paint-engine).
- `src/paint-style.css` — styles for the paint page (reuses the same CSS variables/aesthetic).
- `src/paint-template.html` — page skeleton with placeholder tokens and a
  nav link back to the subset game.

Reuse: `paint.html` inlines `mixbox.js`, `src/engine.js` (for `matchPercent`/
`rgbToLab`/`deltaE`), `src/paint-engine.js`, `src/paint-ui.js`, and
`src/paint-style.css`.

`build.js` is extended to also build `paint.html` from `paint-template.html`
(tokens: `/*PAINT-STYLE*/`, `//MIXBOX`, `//ENGINE`, `//PAINT-ENGINE`, `//PAINT-UI`).
Both `index.html` and `paint.html` are copied into `public/` for deploy.

Cross-linking: add a small nav link in `index.html`'s footer/header to `paint.html`
and vice-versa. (This is a minor edit to the existing `src/template.html`.)

## Testing strategy

- **Unit (Node + TDD)** for `src/paint-engine.js` against real Mixbox:
  - `addDab` then `colorAt` at center returns the pigment color (single pigment).
  - Paint yellow then blue at the same pixel → green-dominant `colorAt`.
  - `colorAt`/`sampleSpot` return white for unpainted pixels.
  - Falloff: a pixel at the brush edge has less weight than center.
  - `sampleSpot` averages over the disk (uniform region → that color).
  - `generateTarget` returns rgb reachable; weights normalized; ≥2 contributors.
  - `clearBuffer` zeroes weight (subsequent `colorAt` is white).
- **Build test:** `paint.html` is produced, self-contained (no unresolved
  tokens, no external `src`/stylesheet refs), contains Mixbox + paint engine,
  size > 150 KB.
- **Headless UI smoke (Node + DOM/canvas stub):** load the real
  `paint-engine.js` + `paint-ui.js` in a sandbox; simulate selecting a pigment,
  painting strokes over the spot, Lock in → match % computed and best-score
  persisted. (Throwaway verification, not committed if the canvas stub proves
  brittle.)
- **Manual:** verify on the deployed `cordle.pages.dev/paint` — painting blends,
  spot sampling, scoring, clear, new target, brush/flow sliders, cross-links.

## Delivery

- Build both pages; `cp index.html public/ && cp paint.html public/`.
- Deploy via `wrangler pages deploy public --project-name cordle`.
- Push source to GitHub `jarredbarber/cordle`.

## Out of scope (v1)

- Undo/redo history.
- Pickup/two-way brush (brush picking up canvas color).
- Variable paper textures, opacity/glazing layers.
- Saving/sharing paintings.
- Mobile multi-touch niceties beyond basic pointer support.

## Attribution / license note

Same as the main game: Mixbox CC BY-NC 4.0 (non-commercial), attributed in the
page footer.
