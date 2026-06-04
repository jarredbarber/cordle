# Cordle Paint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second page `paint.html` (cordle.pages.dev/paint) where the player paints wet-into-wet on a 2D canvas to match a target color under a fixed spot, scored via a "Lock in" button.

**Architecture:** A pure, DOM-free paint engine (`src/paint-engine.js`) stores per-pixel accumulated Mixbox latent vectors + weights; depositing paint is a weighted latent average (the paper's pigment mixing), and display/sampling is one `latentToRgb` per pixel. A canvas UI layer (`src/paint-ui.js`) handles pointer painting, controls, and scoring. The existing `build.js` inlines everything into a single self-contained `paint.html`, reusing the same vendored `mixbox.js` and `src/engine.js` (for `matchPercent`).

**Tech Stack:** Vanilla JS (UMD modules), HTML5 Canvas + Pointer Events, Node `node:test`, Mixbox 2.0, Cloudflare Pages.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/paint-engine.js` | NEW. Pure UMD: palette, per-pixel latent buffer, dab deposit, color sampling, target generation. `window.CordlePaint` / `module.exports`. |
| `test/paint-engine.test.js` | NEW. Unit tests for the paint engine. |
| `src/paint-style.css` | NEW. Styles for the paint page (reuses the same CSS-variable palette). |
| `src/paint-template.html` | NEW. Paint page skeleton with placeholder tokens + nav link to subset game. |
| `src/paint-ui.js` | NEW. Canvas rendering, pointer painting, controls, Lock-in scoring, best-score persistence. |
| `build.js` | MODIFY. Also build `paint.html` from `paint-template.html`. |
| `src/template.html` | MODIFY. Add a nav link to `paint.html`. |
| `test/build.test.js` | MODIFY. Assert `paint.html` is built and self-contained. |
| `paint.html` | Generated deliverable (single file). |

Globals on the paint page (load order in template): `window.mixbox` → `window.CordleEngine` (from engine.js, for `matchPercent`) → `window.CordlePaint` (paint-engine) → paint-ui IIFE.

---

## Task 1: Paint engine — buffer, dabs, sampling

**Files:**
- Create: `src/paint-engine.js`
- Create: `test/paint-engine.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/paint-engine.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/paint-engine.js');

const YELLOW = [254, 236, 0];
const BLUE = [25, 0, 89];
const close = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

function latentOf(rgb) {
  // helper mirrors engine usage via the exported pigmentLatents
  return P.pigmentLatents([{ name: 'x', rgb }])[0];
}

test('createBuffer: correct dimensions and zeroed', () => {
  const buf = P.createBuffer(4, 3);
  assert.strictEqual(buf.w, 4);
  assert.strictEqual(buf.h, 3);
  assert.strictEqual(buf.weight.length, 12);
  assert.strictEqual(buf.accum.length, 12 * P.LATENT_SIZE);
  assert.strictEqual(buf.weight[0], 0);
});

test('colorAt: unpainted pixel reads paper white', () => {
  const buf = P.createBuffer(10, 10);
  assert.deepStrictEqual(P.colorAt(buf, 5, 5), [255, 255, 255]);
});

test('addDab + colorAt: single pigment at center is that pigment color', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(YELLOW));
  assert.ok(close(P.colorAt(buf, 10, 10), YELLOW), `got ${P.colorAt(buf, 10, 10)}`);
});

test('addDab twice: yellow then blue at center mixes to green-dominant', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(YELLOW));
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(BLUE));
  const c = P.colorAt(buf, 10, 10);
  assert.ok(c[1] > c[0] && c[1] > c[2], `expected green dominant, got ${c}`);
});

test('addDab: soft falloff means center weight exceeds edge weight', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 8, 1.0, latentOf(YELLOW));
  const wCenter = buf.weight[10 * 21 + 10];
  const wEdge = buf.weight[10 * 21 + 17]; // 7px from center, radius 8
  assert.ok(wCenter > wEdge && wEdge > 0, `center ${wCenter} edge ${wEdge}`);
});

test('clearBuffer: resets to white/zero', () => {
  const buf = P.createBuffer(10, 10);
  P.addDab(buf, 5, 5, 4, 1.0, latentOf(YELLOW));
  P.clearBuffer(buf);
  assert.strictEqual(buf.weight[5 * 10 + 5], 0);
  assert.deepStrictEqual(P.colorAt(buf, 5, 5), [255, 255, 255]);
});

test('sampleSpot: averages a single-pigment region to that pigment; white if unpainted', () => {
  const buf = P.createBuffer(41, 41);
  assert.deepStrictEqual(P.sampleSpot(buf, 20, 20, 6), [255, 255, 255]);
  P.addDab(buf, 20, 20, 10, 0.8, latentOf(YELLOW));
  assert.ok(close(P.sampleSpot(buf, 20, 20, 6), YELLOW), `got ${P.sampleSpot(buf, 20, 20, 6)}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/paint-engine.test.js`
Expected: FAIL — cannot find module `../src/paint-engine.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/paint-engine.js`:
```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../mixbox.js'));
  } else {
    root.CordlePaint = factory(root.mixbox);
  }
}(typeof self !== 'undefined' ? self : this, function (mixbox) {
  'use strict';

  const L = mixbox.LATENT_SIZE; // 7

  const PAINT_PALETTE = [
    { name: 'Cadmium Yellow', rgb: [254, 236, 0] },
    { name: 'Cadmium Red', rgb: [255, 39, 2] },
    { name: 'Ultramarine Blue', rgb: [25, 0, 89] },
    { name: 'Titanium White', rgb: [243, 243, 243] },
    { name: 'Ivory Black', rgb: [0, 0, 0] },
  ];

  function pigmentLatents(palette) {
    return palette.map((p) => {
      const z = mixbox.rgbToLatent(p.rgb[0], p.rgb[1], p.rgb[2]);
      return Array.from(z); // plain array of length L
    });
  }

  function createBuffer(w, h) {
    return { w, h, accum: new Float32Array(w * h * L), weight: new Float32Array(w * h) };
  }

  function clearBuffer(buf) {
    buf.accum.fill(0);
    buf.weight.fill(0);
  }

  function addDab(buf, cx, cy, radius, flow, pigmentLatent) {
    const { w, h, accum, weight } = buf;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(h - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const wgt = flow * (1 - dist / radius); // soft falloff
        if (wgt <= 0) continue;
        const p = y * w + x;
        const base = p * L;
        for (let i = 0; i < L; i++) accum[base + i] += wgt * pigmentLatent[i];
        weight[p] += wgt;
      }
    }
  }

  function latentColorAtIndex(buf, p) {
    const wgt = buf.weight[p];
    if (wgt <= 0) return [255, 255, 255];
    const base = p * L;
    const z = new Array(L);
    for (let i = 0; i < L; i++) z[i] = buf.accum[base + i] / wgt;
    const o = mixbox.latentToRgb(z);
    return [o[0], o[1], o[2]];
  }

  function colorAt(buf, x, y) {
    return latentColorAtIndex(buf, y * buf.w + x);
  }

  function sampleSpot(buf, cx, cy, sampleRadius) {
    const { w, h, accum, weight } = buf;
    const z = new Array(L).fill(0);
    let wsum = 0;
    const x0 = Math.max(0, Math.floor(cx - sampleRadius));
    const x1 = Math.min(w - 1, Math.ceil(cx + sampleRadius));
    const y0 = Math.max(0, Math.floor(cy - sampleRadius));
    const y1 = Math.min(h - 1, Math.ceil(cy + sampleRadius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (Math.sqrt(dx * dx + dy * dy) > sampleRadius) continue;
        const p = y * w + x;
        const base = p * L;
        for (let i = 0; i < L; i++) z[i] += accum[base + i];
        wsum += weight[p];
      }
    }
    if (wsum <= 0) return [255, 255, 255];
    for (let i = 0; i < L; i++) z[i] /= wsum;
    const o = mixbox.latentToRgb(z);
    return [o[0], o[1], o[2]];
  }

  return {
    LATENT_SIZE: L,
    PAINT_PALETTE,
    pigmentLatents,
    createBuffer,
    clearBuffer,
    addDab,
    colorAt,
    sampleSpot,
  };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/paint-engine.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paint-engine.js test/paint-engine.test.js
git commit -m "feat: add paint engine with latent-accumulation canvas buffer"
```

---

## Task 2: Paint engine — target generation

**Files:**
- Modify: `src/paint-engine.js`
- Modify: `test/paint-engine.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/paint-engine.test.js`:
```js
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

test('generateTarget: normalized weights, >=2 contributors, valid rgb', () => {
  const t = P.generateTarget(P.PAINT_PALETTE, seededRng(3));
  assert.strictEqual(t.weights.length, P.PAINT_PALETTE.length);
  const sum = t.weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `weights sum ${sum}`);
  assert.ok(t.weights.filter((x) => x >= 0.15).length >= 2, 'needs >=2 real contributors');
  assert.ok(Array.isArray(t.rgb) && t.rgb.length === 3);
  assert.ok(t.rgb.every((v) => v >= 0 && v <= 255));
});

test('generateTarget: reachable — painting the target weights at a spot matches rgb', () => {
  const t = P.generateTarget(P.PAINT_PALETTE, seededRng(11));
  const latents = P.pigmentLatents(P.PAINT_PALETTE);
  const buf = P.createBuffer(11, 11);
  // Deposit each pigment at the same pixel with flow proportional to its weight.
  t.weights.forEach((wgt, k) => {
    if (wgt > 0) P.addDab(buf, 5, 5, 1, wgt, latents[k]);
  });
  const c = P.colorAt(buf, 5, 5);
  assert.ok(c.every((v, i) => Math.abs(v - t.rgb[i]) <= 2), `reachable mismatch ${c} vs ${t.rgb}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/paint-engine.test.js`
Expected: FAIL — `P.generateTarget is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/paint-engine.js`, add inside the factory (before the `return`):
```js
  function generateTarget(palette, rng) {
    rng = rng || Math.random;
    const latents = pigmentLatents(palette);
    let weights;
    for (let attempt = 0; attempt < 100; attempt++) {
      const raw = palette.map(() => { const r = rng(); return r * r; });
      const sum = raw.reduce((a, b) => a + b, 0);
      if (sum <= 0) continue;
      weights = raw.map((x) => x / sum);
      if (weights.filter((x) => x >= 0.15).length >= 2) break;
    }
    const z = new Array(L).fill(0);
    for (let k = 0; k < palette.length; k++)
      for (let i = 0; i < L; i++) z[i] += weights[k] * latents[k][i];
    const o = mixbox.latentToRgb(z);
    return { weights, rgb: [o[0], o[1], o[2]] };
  }
```

Add `generateTarget` to the returned object:
```js
  return {
    LATENT_SIZE: L,
    PAINT_PALETTE,
    pigmentLatents,
    createBuffer,
    clearBuffer,
    addDab,
    colorAt,
    sampleSpot,
    generateTarget,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/paint-engine.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/paint-engine.js test/paint-engine.test.js
git commit -m "feat: add reachable target generation for paint mode"
```

---

## Task 3: Paint page styling and template

**Files:**
- Create: `src/paint-style.css`
- Create: `src/paint-template.html`

- [ ] **Step 1: Create `src/paint-style.css`**

```css
:root {
  --bg: #14110f;
  --panel: #1f1b18;
  --ink: #f4efe9;
  --muted: #a89e93;
  --line: #3a332d;
  --accent: #d9a441;
  --good: #4caf6a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: radial-gradient(1200px 600px at 50% -10%, #241f1b, var(--bg));
  color: var(--ink);
  min-height: 100vh;
}
header { text-align: center; padding: 1.4rem 1rem 0.4rem; }
h1 { margin: 0; font-size: 2rem; letter-spacing: 0.08em; font-weight: 800; }
.tag { color: var(--muted); margin: 0.2rem 0 0; }
.nav { text-align: center; margin: 0.3rem 0; }
.nav a { color: var(--accent); text-decoration: none; font-weight: 600; }
main { max-width: 560px; margin: 0 auto; padding: 1rem; }
.targets { display: flex; gap: 1rem; justify-content: center; align-items: center; margin: 0.5rem 0 1rem; }
.swatch-big {
  flex: 1; max-width: 160px; aspect-ratio: 1.6; border-radius: 14px; border: 1px solid var(--line);
  display: flex; align-items: flex-end; padding: 0.5rem; box-shadow: inset 0 0 40px rgba(0,0,0,0.25);
}
.swatch-big span {
  background: rgba(0,0,0,0.45); color: #fff; font-size: 0.72rem;
  padding: 0.15rem 0.45rem; border-radius: 6px;
}
.canvas-wrap { position: relative; width: 100%; max-width: 420px; margin: 0 auto; aspect-ratio: 1; }
#paint-canvas {
  width: 100%; height: 100%; border-radius: 12px; border: 1px solid var(--line);
  background: #fff; touch-action: none; cursor: crosshair; display: block;
}
#spot {
  position: absolute; width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid #000; box-shadow: 0 0 0 2px #fff; transform: translate(-50%, -50%);
  pointer-events: none;
}
.palette { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin: 1rem 0 0.6rem; }
.pig {
  width: 46px; height: 46px; border-radius: 10px; border: 2px solid var(--line);
  cursor: pointer; transition: transform 0.08s;
}
.pig:hover { transform: translateY(-2px); }
.pig.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.sliders { display: flex; gap: 1.2rem; justify-content: center; flex-wrap: wrap; margin: 0.4rem 0; color: var(--muted); }
.sliders label { display: flex; flex-direction: column; align-items: center; font-size: 0.8rem; gap: 0.2rem; }
.controls { display: flex; gap: 0.6rem; justify-content: center; margin: 0.9rem 0; flex-wrap: wrap; }
button {
  background: var(--panel); color: var(--ink); border: 1px solid var(--line);
  padding: 0.55rem 0.9rem; border-radius: 10px; cursor: pointer; font-weight: 600;
}
button:hover { border-color: var(--accent); }
button#lock { background: var(--accent); color: #2a1d05; border-color: var(--accent); }
#result { text-align: center; font-size: 1.1rem; font-weight: 700; margin: 0.6rem 0; min-height: 1.4em; }
#result .pct { color: var(--good); }
#best { text-align: center; color: var(--muted); font-size: 0.85rem; }
footer { text-align: center; color: var(--muted); font-size: 0.75rem; padding: 1.5rem 1rem 2rem; }
footer a { color: var(--muted); }
```

- [ ] **Step 2: Create `src/paint-template.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cordle Paint — match the color</title>
<style>
/*PAINT-STYLE*/
</style>
</head>
<body>
<header>
  <h1>CORDLE PAINT</h1>
  <p class="tag">Mix paint on the canvas to match the target under the spot.</p>
  <p class="nav"><a href="index.html">← Subset game</a></p>
</header>
<main>
  <section class="targets">
    <div class="swatch-big" id="target"><span>Target</span></div>
    <div class="swatch-big" id="spot-readout"><span>Under spot</span></div>
  </section>
  <div class="canvas-wrap">
    <canvas id="paint-canvas" width="420" height="420"></canvas>
    <div id="spot"></div>
  </div>
  <section class="palette" id="palette"></section>
  <div class="sliders">
    <label>Brush size <input type="range" id="size" min="4" max="40" value="16" /></label>
    <label>Flow <input type="range" id="flow" min="5" max="100" value="40" /></label>
  </div>
  <div class="controls">
    <button id="lock">Lock in</button>
    <button id="clear">Clear canvas</button>
    <button id="new">New target</button>
  </div>
  <div id="result"></div>
  <div id="best"></div>
</main>
<footer>
  Pigment mixing by
  <a href="https://github.com/scrtwpns/mixbox" target="_blank" rel="noopener">Mixbox</a>
  © Secret Weapons — CC BY-NC 4.0. A non-commercial fan project.
</footer>
<script>
//MIXBOX
</script>
<script>
//ENGINE
</script>
<script>
//PAINT-ENGINE
</script>
<script>
//PAINT-UI
</script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/paint-style.css src/paint-template.html
git commit -m "feat: add paint page template and styling"
```

---

## Task 4: Paint UI layer

**Files:**
- Create: `src/paint-ui.js`

- [ ] **Step 1: Create `src/paint-ui.js`**

```js
(function () {
  'use strict';
  const P = window.CordlePaint;
  const E = window.CordleEngine;

  const W = 420, H = 420;
  const SPOT_X = 210, SPOT_Y = 210, SAMPLE_RADIUS = 6;
  const BEST_KEY = 'cordle-paint-best';

  const $ = (id) => document.getElementById(id);
  const rgbCss = (rgb) => `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;

  const canvas = $('paint-canvas');
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);

  const latents = P.pigmentLatents(P.PAINT_PALETTE);
  const buffer = P.createBuffer(W, H);

  let target = null;
  let selected = 0;
  let painting = false;
  let last = null;

  function fillWhite() {
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function renderRegion(cx, cy, radius) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(W - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(H - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = P.colorAt(buffer, x, y);
        const idx = (y * W + x) * 4;
        img.data[idx] = c[0]; img.data[idx + 1] = c[1]; img.data[idx + 2] = c[2]; img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0, x0, y0, (x1 - x0) + 1, (y1 - y0) + 1);
  }

  function positionSpot() {
    const spot = $('spot');
    spot.style.left = (SPOT_X / W * 100) + '%';
    spot.style.top = (SPOT_Y / H * 100) + '%';
  }

  function toLogical(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (W / rect.width),
      y: (ev.clientY - rect.top) * (H / rect.height),
    };
  }

  function brush() {
    return { radius: +$('size').value, flow: (+$('flow').value) / 100 };
  }

  function stroke(x, y) {
    const { radius, flow } = brush();
    P.addDab(buffer, x, y, radius, flow, latents[selected]);
    renderRegion(x, y, radius);
  }

  function strokeLine(a, b) {
    const { radius } = brush();
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / (radius / 2)));
    for (let s = 1; s <= steps; s++) {
      stroke(a.x + (dx * s) / steps, a.y + (dy * s) / steps);
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    painting = true;
    const pt = toLogical(ev);
    last = pt;
    stroke(pt.x, pt.y);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const pt = toLogical(ev);
    strokeLine(last, pt);
    last = pt;
  });
  const endStroke = () => { painting = false; last = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', endStroke);

  function renderPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    P.PAINT_PALETTE.forEach((pig, i) => {
      const el = document.createElement('div');
      el.className = 'pig' + (i === selected ? ' selected' : '');
      el.style.background = rgbCss(pig.rgb);
      el.title = pig.name;
      el.addEventListener('click', () => { selected = i; renderPalette(); });
      pal.appendChild(el);
    });
  }

  function clearCanvas() {
    P.clearBuffer(buffer);
    fillWhite();
    $('spot-readout').style.background = '#fff';
    $('result').innerHTML = '';
  }

  function newTarget() {
    target = P.generateTarget(P.PAINT_PALETTE, Math.random);
    $('target').style.background = rgbCss(target.rgb);
    clearCanvas();
  }

  function tier(pct) {
    if (pct >= 98) return 'Nailed it!';
    if (pct >= 90) return 'Great';
    if (pct >= 75) return 'Close';
    return 'Keep mixing';
  }

  function lockIn() {
    const c = P.sampleSpot(buffer, SPOT_X, SPOT_Y, SAMPLE_RADIUS);
    $('spot-readout').style.background = rgbCss(c);
    const pct = E.matchPercent(c, target.rgb);
    $('result').innerHTML = `<span class="pct">${pct}%</span> — ${tier(pct)}`;
    let best = 0;
    try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { best = 0; }
    if (pct > best) {
      best = pct;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    $('best').textContent = `Best match: ${best}%`;
  }

  $('lock').addEventListener('click', lockIn);
  $('clear').addEventListener('click', clearCanvas);
  $('new').addEventListener('click', newTarget);

  let best0 = 0;
  try { best0 = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { best0 = 0; }
  $('best').textContent = `Best match: ${best0}%`;

  positionSpot();
  renderPalette();
  fillWhite();
  newTarget();
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/paint-ui.js
git commit -m "feat: add paint canvas UI with pointer painting and lock-in scoring"
```

---

## Task 5: Build `paint.html` and cross-link

**Files:**
- Modify: `build.js`
- Modify: `src/template.html`
- Modify: `test/build.test.js`

- [ ] **Step 1: Write the failing test (extend build test)**

In `test/build.test.js`, append a new test after the existing one:
```js
test('build produces a self-contained paint.html', () => {
  execSync('node build.js', { cwd: ROOT });
  const html = fs.readFileSync(path.join(ROOT, 'paint.html'), 'utf8');

  assert.ok(!html.includes('/*PAINT-STYLE*/'), 'PAINT-STYLE placeholder not replaced');
  assert.ok(!html.includes('//MIXBOX'), 'MIXBOX placeholder not replaced');
  assert.ok(!html.includes('//ENGINE'), 'ENGINE placeholder not replaced');
  assert.ok(!html.includes('//PAINT-ENGINE'), 'PAINT-ENGINE placeholder not replaced');
  assert.ok(!html.includes('//PAINT-UI'), 'PAINT-UI placeholder not replaced');

  assert.ok(html.includes('MIXBOX 2.0'), 'Mixbox not inlined');
  assert.ok(html.includes('CordlePaint'), 'paint engine not inlined');
  assert.ok(html.includes('paint-canvas'), 'canvas markup not present');

  assert.ok(!/<script[^>]*\ssrc=/.test(html), 'unexpected external script src');
  assert.ok(!/<link[^>]*stylesheet/.test(html), 'unexpected external stylesheet');
  assert.ok(html.length > 150000, `paint.html too small: ${html.length}`);
});

test('index.html cross-links to paint.html', () => {
  execSync('node build.js', { cwd: ROOT });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('paint.html'), 'index missing link to paint page');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `paint.html` not produced / no `paint.html` link in index.

- [ ] **Step 3: Rewrite `build.js`**

Replace the entire contents of `build.js` with:
```js
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Use function replacements so `$` in the Mixbox LUT is not treated as a
// special replacement pattern by String.prototype.replace.
function build(template, outfile, tokens) {
  let html = read(template);
  for (const [token, file] of tokens) html = html.replace(token, () => read(file));
  fs.writeFileSync(path.join(root, outfile), html);
  console.log(`Built ${outfile} (${html.length} bytes)`);
}

build('src/template.html', 'index.html', [
  ['/*STYLE*/', 'src/style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//UI', 'src/ui.js'],
]);

build('src/paint-template.html', 'paint.html', [
  ['/*PAINT-STYLE*/', 'src/paint-style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//PAINT-ENGINE', 'src/paint-engine.js'],
  ['//PAINT-UI', 'src/paint-ui.js'],
]);
```

- [ ] **Step 4: Add the cross-link to `src/template.html`**

In `src/template.html`, find:
```html
  <p class="tag">Pick the pigments that mix to the target color.</p>
```
Replace it with:
```html
  <p class="tag">Pick the pigments that mix to the target color.</p>
  <p class="nav"><a href="paint.html">Paint mode →</a></p>
```

Then add this rule to `src/style.css` (append at the end of the file):
```css
.nav { text-align: center; margin: 0.3rem 0; }
.nav a { color: var(--accent); text-decoration: none; font-weight: 600; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — all engine, paint-engine, and build tests (index + paint + cross-link) green. Report counts.

- [ ] **Step 6: Verify Mixbox integrity in the built paint page**

Run:
```bash
node build.js
wc -c paint.html
grep -c 'decompress' paint.html
```
Expected: `paint.html` ~190 KB+, and `decompress` count >= 1 (LUT survived inlining, no `$` corruption).

- [ ] **Step 7: Commit**

```bash
git add build.js src/template.html src/style.css test/build.test.js index.html paint.html
git commit -m "feat: build paint.html and cross-link the two modes"
```

---

## Task 6: Headless verification

**Files:** Create `/tmp/paint-smoke.js` (throwaway, not committed)

- [ ] **Step 1: Write a DOM/canvas smoke harness**

Create `/tmp/paint-smoke.js`:
```js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = '/home/jarred/code/cordle';
const mixbox = require(path.join(ROOT, 'mixbox.js'));

function makeEl() {
  const el = { style: {}, _children: [], _lis: {}, className: '', _text: '', _html: '',
    width: 420, height: 420,
    addEventListener(e, f) { this._lis[e] = f; },
    appendChild(c) { this._children.push(c); return c; },
    setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 420 }; },
    getContext() {
      return {
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData() {},
      };
    },
    get children() { return this._children; },
    click() { if (this._lis.click) this._lis.click(); },
  };
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = v; } });
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; if (v === '') this._children = []; } });
  Object.defineProperty(el, 'value', { get() { return this._v != null ? this._v : '16'; }, set(v) { this._v = v; } });
  return el;
}

const ids = ['paint-canvas','spot','target','spot-readout','palette','size','flow','lock','clear','new','result','best'];
const els = {}; ids.forEach((id) => { els[id] = makeEl(); });
els.size._v = '16'; els.flow._v = '40';

const localStorage = { store: {}, getItem(k) { return k in this.store ? this.store[k] : null; }, setItem(k, v) { this.store[k] = String(v); } };
const document = { getElementById: (id) => els[id], createElement: () => makeEl() };

const sandbox = { console, document, localStorage, mixbox, Math, JSON, Array, Object, Set, Number, String, Float32Array, Uint8ClampedArray };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const load = (f) => vm.runInContext('var module=undefined;' + fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
load('src/engine.js');
load('src/paint-engine.js');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/paint-ui.js'), 'utf8'), sandbox, { filename: 'paint-ui.js' });

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

check(!!sandbox.CordlePaint, 'CordlePaint global present');
check(els.target.style.background && els.target.style.background.startsWith('rgb'), 'target painted: ' + els.target.style.background);
check(els.palette.children.length === 5, 'palette has 5 pigments, got ' + els.palette.children.length);

// Select blue (index 2), paint over the spot, lock in -> should read blue-ish and score.
els.palette.children[2].click();
const cv = els['paint-canvas'];
cv._lis.pointerdown({ pointerId: 1, clientX: 210, clientY: 210 });
for (let i = 0; i < 8; i++) cv._lis.pointermove({ pointerId: 1, clientX: 210 + i, clientY: 210 });
cv._lis.pointerup({ pointerId: 1 });
els.lock.click();
check(/\d+% — /.test(els.result._html) || /\d+%/.test(els.result._html), 'lock-in produced a score: ' + els.result._html);
check(/Best match: \d+%/.test(els.best._text), 'best score shown: ' + els.best._text);
check(els['spot-readout'].style.background.startsWith('rgb'), 'spot readout painted');

// Clear resets result.
els.clear.click();
check(els.result._html === '', 'clear resets result');

console.log(`\nPAINT SMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the smoke harness**

Run: `node /tmp/paint-smoke.js`
Expected: `PAINT SMOKE: 7 passed, 0 failed`.

If the harness fails due to stub limitations (not real bugs), note it and rely on unit tests + manual verification instead — do not weaken the engine to satisfy the stub.

- [ ] **Step 3: Full suite**

Run: `node --test`
Expected: all tests pass. Report counts.

---

## Task 7: Deploy and publish

**Files:** none (ops)

- [ ] **Step 1: Build and stage both pages**

Run:
```bash
node build.js
mkdir -p public
cp index.html public/index.html
cp paint.html public/paint.html
ls -1 public
```
Expected: `public/` contains `index.html` and `paint.html`.

- [ ] **Step 2: Deploy to Cloudflare Pages**

Run:
```bash
set -a; . /home/jarred/code/loe-vibecode/.env; set +a; export CLOUDFLARE_API_TOKEN
npx wrangler pages deploy public --project-name cordle --branch main
```
Expected: "Deployment complete" with a URL.

- [ ] **Step 3: Verify the live paint page**

Run:
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}  %{size_download} bytes\n" https://cordle.pages.dev/paint
curl -sS https://cordle.pages.dev/paint | grep -oE '<title>[^<]+</title>|CordlePaint|paint-canvas' | sort -u
```
Expected: HTTP 200 and the paint markers present.

- [ ] **Step 4: Commit any deploy-related changes and push to GitHub**

Run:
```bash
git add -A
git commit -m "chore: deploy paint mode" --allow-empty
git push origin HEAD
```
(If on a feature branch, this pushes the branch; the branch is merged via finishing-a-development-branch.)

- [ ] **Step 5: Manual verification on the live site**

Open `https://cordle.pages.dev/paint` and confirm:
- A target color and the spot marker are shown; canvas is white.
- Selecting a pigment and dragging paints; overlapping a second pigment blends (yellow over blue → green).
- Brush size and flow sliders change stroke behavior.
- "Lock in" reads the spot, shows a match % + tier, updates "Best match".
- "Clear canvas" whitens the canvas and clears the result; "New target" gives a new color.
- Nav links move between the subset game and paint mode.

---

## Self-Review Notes

- **Spec coverage:** 2D drag canvas (Tasks 3,4), latent-accumulation buffer (Task 1), spot sampling (Tasks 1,4), wet blend + size/flow (Tasks 1,4), fixed palette + reachable target (Tasks 1,2), separate `paint.html` + cross-link (Tasks 3,5), Lock-in scoring + best in localStorage (Task 4), Clear reset / no undo (Task 4), reuse of `engine.matchPercent` (Task 4), build into single file (Task 5), deploy + push (Task 7). All covered.
- **Type consistency:** `createBuffer` → `{w,h,accum,weight}` consumed by `addDab`/`colorAt`/`sampleSpot`/`clearBuffer`; `generateTarget` → `{weights,rgb}` consumed by paint-ui; `pigmentLatents` → array of length-7 arrays used by `addDab`. Globals: `CordlePaint`, `CordleEngine` consistent across template load order and paint-ui.
- **No placeholders:** all code complete; `//MIXBOX` etc. are intentional template tokens, asserted-removed by the build test.
- **Note on `engine.js` in Node load:** the smoke harness prefixes `var module=undefined;` so the UMD takes the browser branch and sets `window.CordleEngine`/`window.CordlePaint` in the sandbox.
