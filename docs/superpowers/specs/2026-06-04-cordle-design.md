# Cordle — Color-Mixing Wordle (Design Spec)

**Date:** 2026-06-04
**Status:** Approved (design), pending implementation plan

## Summary

Cordle is a single-file web game (`index.html`). The player is shown a **target
color** and a **palette of 8 real artist pigments**, and must find the exact
**subset (2–4 pigments)** that, mixed in equal parts, reproduces the target.
Play is **endless** (fresh random puzzle on demand), with **6 guesses** per
puzzle, rich per-guess feedback, and a live mix preview.

The core hook is *accurate* paint mixing: combining pigments behaves like real
subtractive pigment mixing, powered by Mixbox.

## Decisions (locked)

| Area | Decision |
|------|----------|
| Mix mechanic | Equal-parts subset (each chosen pigment in/out, equal amounts). Proportions/ratios are a possible future hard mode — **out of scope** for v1. |
| Feedback | Both: mixed-result swatch + closeness meter **and** per-swatch Wordle hints. |
| Win condition | Exact subset match (selected set == answer set). |
| Puzzle size | 8-pigment palette; answer uses 2–4 pigments. |
| Guesses | 6 (classic Wordle). |
| Mixing engine | Mixbox 2.0 (SIGGRAPH Asia 2021, CC BY-NC 4.0), embedded inline. |
| Puzzle mode | Endless only (no daily seed). |
| Palette source | Real artist pigments (from Mixbox's documented pigment list). |
| Answer-size hint | Shown to the player (analogous to Wordle word length). |
| Per-swatch hints | Only applied to swatches the player selected in that guess. Unselected answer pigments are **not** auto-revealed. |
| Live preview | Current selection mixes to a live preview swatch + live match %, shown beside the target before submitting. |

## Engine: Mixbox

- **Source:** Mixbox 2.0 (`mixbox.js`, ~177 KB), authors Šárka Sochorová & Ondřej
  Jamriška. License **CC BY-NC 4.0** — non-commercial use with attribution.
- **Self-contained:** verified 0 network calls; the lookup table is baked into
  the JS file. It runs in both browser and Node (no DOM dependency).
- **Embedding:** paste the full `mixbox.js` verbatim into a `<script>` block in
  `index.html`, preserving its license header comment. Add a visible attribution
  line in the page footer ("Pigment mixing by Mixbox — © Secret Weapons,
  CC BY-NC 4.0").
- **Multi-color mixing API (official):**
  ```js
  const z = subsetRgb.map(c => mixbox.rgbToLatent(c[0], c[1], c[2]));
  const zMix = new Array(mixbox.LATENT_SIZE).fill(0);
  for (const zi of z)
    for (let i = 0; i < zMix.length; i++) zMix[i] += zi[i] / z.length; // equal parts
  const [r, g, b] = mixbox.latentToRgb(zMix);
  ```

## Color distance

- Convert sRGB → CIELAB and compute ΔE (CIE76 is acceptable; ΔE2000 if cheap).
- Surface as a **match %**: `match = clamp(100 * (1 - deltaE / DE_MAX), 0, 100)`,
  with `DE_MAX` chosen so a perfect match reads 100% and wildly-off mixes read
  near 0%. Exact tuning is an implementation detail; calibrate so the meter feels
  informative across typical mixes.

## Pigment data

A curated table of real pigments, each `{ name, rgb:[r,g,b] }`, taken from
Mixbox's documented pigment list. Target ~10–14 pigments in the pool so each
8-pigment palette has variety. Representative set:

- Cadmium Yellow `254,236,0`
- Hansa Yellow `252,211,0`
- Cadmium Orange `255,105,0`
- Cadmium Red `255,39,2`
- Quinacridone Magenta `128,2,46`
- Cobalt Blue `0,33,133`
- Ultramarine Blue `25,0,89`
- Phthalo Blue `13,27,68`
- Phthalo Green `0,60,50`
- Permanent Green `7,109,22`
- Sap Green `107,148,4`
- Burnt Sienna `123,72,0`
- Titanium White `243,243,243`
- Ivory Black `0,0,0`

(Final list confirmed against the inlined Mixbox source during implementation.)

## Puzzle generation (per "New puzzle")

1. Sample 8 distinct pigments from the pool → the palette.
2. Pick answer size `N` uniformly from {2, 3, 4}.
3. Choose `N` of the 8 palette pigments → the hidden answer set.
4. Mix the answer set (equal-parts latent average) → the **target** color shown.
5. Display the target swatch and the text "Mix uses N colors."

No uniqueness guarantee is required (exact-subset win + per-swatch hints make the
answer well-defined regardless of color collisions). Generation should avoid the
degenerate case where the palette contains a duplicate of the target-producing
set trivially; not critical for v1.

## Gameplay loop

1. Player clicks palette swatches to toggle them into the **current selection**.
2. A **live preview** swatch shows the equal-parts mix of the current selection
   beside the target, with a live **match %**. Empty selection → neutral preview.
3. Player submits a guess (consumes 1 of 6). Validation: at least 1 swatch
   selected. (Selecting exactly N is *not* enforced — picking the wrong count is
   a legitimate wrong guess.)
4. A **history row** is appended showing:
   - the swatches the player selected,
   - a per-swatch chip: 🟩 green if that swatch is in the answer, ⬜ gray if not
     (only for selected swatches),
   - the resulting **mixed swatch**,
   - the **match %**.
5. **Win:** selected set exactly equals the answer set → win screen.
   **Lose:** 6 guesses used without a win → reveal the answer set (highlight the
   correct swatches) and the answer's mixed swatch.
6. "New puzzle" button starts a fresh endless puzzle at any time.

## Persistence

Lightweight `localStorage` stats: games played, games won, win %, current/best
streak, and a guess-count distribution (1–6 + fail). Display in a small stats
panel/modal. No accounts, no network.

## Code structure (inside `index.html`)

1. `<style>` — all CSS (clean, painterly aesthetic).
2. `<script>` Mixbox 2.0 engine block, **verbatim**, license header intact.
3. `<script>` game logic:
   - **Pure functions (DOM-free, Node-testable):**
     - `mixSubset(rgbList) -> [r,g,b]`
     - `rgbToLab([r,g,b]) -> [L,a,b]`, `deltaE(lab1, lab2) -> number`,
       `matchPercent(rgb1, rgb2) -> number`
     - `generatePuzzle(pool, rng) -> { palette, answerIndices, target }`
     - `evaluateGuess(selectedIndices, answerIndices, palette) ->
        { perSwatch:[{index,inAnswer}], mixedRgb, match, win }`
   - **UI layer:** state object, render functions, event handlers, stats.
4. Page markup: header, target+preview area, palette grid, guess history,
   controls (submit / new puzzle / stats), footer with attribution.

The pure functions are exported (e.g. attached to a module-detectable object or a
small conditional `module.exports`) so they can be unit-tested in Node alongside
the inlined Mixbox engine.

## Testing strategy

- **Unit (Node + TDD):** test pure functions against the real inlined Mixbox
  engine — `mixSubset` (e.g. yellow+blue trends green, not gray), `deltaE`/
  `matchPercent` (identical colors → 100%, opposite → low), `generatePuzzle`
  (palette size 8, answer size 2–4, answer ⊆ palette, target == mix of answer),
  `evaluateGuess` (per-swatch correctness, win only on exact set match).
- **Manual / verify:** open the page locally (`file://`) and on the live Pages
  URL; confirm selection toggling, live preview, guess rows, win/lose, new
  puzzle, and stats persistence.

## Delivery

- `git init` the project; commit `index.html` + spec + tests.
- Create GitHub repo `cordle` under `jarredbarber`, push.
- Enable GitHub Pages (main branch, root) → `https://jarredbarber.github.io/cordle/`.

## Out of scope (v1)

- Proportions/ratios mode (future hard mode).
- Daily seeded puzzle / sharing cards.
- Accounts, backend, multiplayer.
- Spectral/Kubelka-Munk custom engine (Mixbox covers this).

## Attribution / license note

Mixbox is CC BY-NC 4.0 (non-commercial). This personal, non-commercial game on
GitHub Pages is compliant provided attribution is shown. If the project ever goes
commercial, a Mixbox commercial license is required (mixbox@scrtwpns.com).
