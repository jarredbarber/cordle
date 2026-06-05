# Realistic Brush — Loaded Bristle Brush (Design Spec)

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan

## Summary

Replace the paint mode's clean-deposit brush with a **loaded bristle brush** that
behaves more like real paint. The brush itself is a tiny paint reservoir — it
carries an accumulated Mixbox latent plus a *load* amount — and four behaviors
fall out of that single idea: **pickup/smearing**, **paint load + run-out**,
**bristle texture**, and **speed tapering**. Only the paint page (`paint.html`)
changes.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Scope | Replace the existing brush entirely (no simple/realistic toggle). |
| Controls | Brush **Size**, **Flow**, **Wetness** sliders + a **carried-paint swatch** and **load meter**. |
| Pickup semantics | Non-destructive: the brush *copies/tints* its carried color toward the wet canvas color under it. It does NOT erase/lift paint, so the canvas you are matching stays stable. |
| Page | `paint.html` only. New page not created. |

## The model: a brush that carries paint

The brush is `{ accum: number[7], weight: number, capacity: number }` — the same
latent-accumulation representation as a canvas cell. Carried color =
`latentToRgb(accum / weight)`; load fraction = `weight / capacity`.

- **Reload:** tapping a pigment fills the brush — `accum = pigmentLatent * capacity`,
  `weight = capacity`. Carried color becomes that pigment.
- **Pickup / smearing:** before depositing, each bristle reads the wet canvas
  latent under it; if there is paint there, the brush's carried color is blended
  toward it by `wetness * PICKUP_K`. Dragging yellow through blue tints the brush
  green and carries it forward (two-way wet blending). A nearly-dry brush also
  absorbs a little actual paint (lets it smudge existing color).
- **Load + run-out:** each bristle deposits paint scaled by remaining load
  (`loadFactor = clamp(weight/capacity, 0, 1)`) and consumes some load. As load
  drops the stroke thins and fades to dry until reloaded.
- **Bristle texture:** the footprint is `BRISTLE_COUNT` (~16) procedural bristles,
  each an offset within the brush radius with its own strength, generated once per
  stroke (seeded). Each lays a small soft sub-dab → streaky coverage, broken edges.
- **Tapering:** the UI spaces dabs along the path and scales per-dab paint by a
  `speedTaper(speed)` factor (faster → less paint), so quick flicks taper thin.

## Architecture

`paint-engine.js` stays the canvas-buffer owner. One small addition to it:

- `sampleLatent(buf, cx, cy, r) -> { z: number[7], weight: number }` — the
  averaged latent and total weight under a disc (`weight: 0`, `z` all-zero when
  unpainted). `sampleSpot` is refactored to use it. This is what brush pickup
  needs (latent + a real "is there paint here?" signal; `sampleSpot`'s white-on-
  empty RGB would wrongly tint the brush toward paper).

New pure, DOM-free UMD module `src/brush.js` (Node-testable), built on
`paint-engine` + `mixbox`:

- `createBrush() -> {accum, weight, capacity}`
- `loadBrush(brush, pigmentLatent, capacity)` — fill the brush
- `brushColor(brush) -> [r,g,b] | null` (null when effectively dry)
- `brushLoad(brush) -> 0..1`
- `bristleOffsets(radius, seed, count) -> [{dx, dy, strength}]` — deterministic per seed
- `speedTaper(speed) -> number` in `(0, 1]`, monotonically decreasing
- `applyBrushDab(buf, brush, cx, cy, { radius, flow, wetness, bristles, speed })` —
  for each bristle: pickup (via `paintEngine.sampleLatent`) → deposit (via
  `paintEngine.addDab` with the brush's carried latent) → deplete the brush.
  Mutates `buf` and `brush`.

In the browser, `brush.js` reads `window.CordlePaint` (paint-engine) and
`window.mixbox`, and exposes `window.CordleBrush`.

`paint-ui.js` changes: drive strokes through `CordleBrush` instead of calling
`addDab` directly — on pointer down, generate bristles (seed = a per-stroke
counter) and reload state is whatever the current brush holds; along the path,
step by spacing ≈ `radius * 0.4`, compute `speed` from distance between pointer
samples, call `applyBrushDab`, and re-render the touched region. Tapping a
pigment calls `loadBrush`. Render the carried-paint swatch (`brushColor`) and the
load meter (`brushLoad`) after each dab and on reload.

`paint-template.html` additions: a **Wetness** range input, a **carried-paint**
swatch element, and a **load meter** element. `paint-style.css` gets styles for
the swatch + meter. `build.js` adds a `//BRUSH` token to the `paint.html` build,
inlining `src/brush.js` between `paint-engine.js` and `paint-ui.js`.

## Tuning constants (initial; calibrated during implementation)

- `BRISTLE_COUNT = 16`, bristle sub-radius ≈ `radius * 0.35`.
- `PICKUP_K = 0.5` (scales the Wetness slider's 0..1 into pickup strength).
- `DEPOSIT_K`, `CONSUME_K`, `capacity` chosen so a full load paints a stroke of
  roughly a few brush-widths before running dry. Exact values are an
  implementation detail; tune so run-out feels natural and matching is still
  achievable by reloading.
- Wetness slider range maps to `[0, 1]`; Flow and Size keep their current ranges.

## Testing strategy

- **Unit (Node + TDD)** for `src/brush.js` against real Mixbox + paint-engine:
  - `loadBrush` → `brushColor` equals the pigment, `brushLoad` is 1.
  - `applyBrushDab` deposits (canvas `colorAt` changes) and depletes (`brushLoad`
    drops below 1).
  - Run-out: repeated `applyBrushDab` without reload drives `brushLoad` → ~0 and
    deposits become negligible (canvas stops changing).
  - Pickup: over a blue-painted region, a yellow-loaded brush with high wetness
    drifts its `brushColor` toward green (g rises); with wetness 0 it stays yellow.
  - `bristleOffsets`: returns `count` offsets within `radius`, deterministic for a
    given seed, with varied strengths.
  - `speedTaper`: monotonically decreasing, always in `(0, 1]`.
- **Unit** for the `paint-engine.sampleLatent` addition: unpainted → weight 0;
  painted single-pigment region → weight > 0 and `z` round-trips to that pigment;
  existing `sampleSpot` tests still pass.
- **Build test:** `paint.html` still self-contained, now also contains
  `CordleBrush`, no unresolved `//BRUSH` token.
- **Headless smoke (Node + canvas stub):** select pigment → paint a stroke →
  carried swatch + load meter update → load depletes → Lock in still scores.
- **Manual:** on the deployed page — strokes show bristle streaks; dragging one
  color through another smears/blends; the brush runs out and reloads on pigment
  tap; Wetness changes smear strength; quick strokes taper; Lock-in scoring and
  best persist.

## Delivery

Build → copy `index.html` + `paint.html` into `public/` → `wrangler pages deploy`
→ push to GitHub `jarredbarber/cordle`.

## Out of scope (v1)

- Destructive smudge (lifting/moving paint off the canvas).
- Impasto/height/lighting, drying over time, paper texture.
- Pressure input, multi-touch.
- A simple/realistic toggle (we replace outright).

## Attribution / license note

Unchanged — Mixbox CC BY-NC 4.0 (non-commercial), attributed in the page footer.
