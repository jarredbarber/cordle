# Realistic Brush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paint mode's clean-deposit brush with a loaded bristle brush that picks up/smears wet paint, runs out of paint, has bristle texture, and tapers with stroke speed.

**Architecture:** A new pure module `src/brush.js` models the brush as its own paint reservoir (accumulated latent + load) built on top of `paint-engine.js` (using its `addDab` to deposit and a new `sampleLatent` to read wet paint for pickup). `paint-ui.js` drives strokes through the brush and renders a carried-color swatch + load meter. Only `paint.html` changes; `build.js` inlines `brush.js` into it.

**Tech Stack:** Vanilla JS (UMD), HTML5 Canvas + Pointer Events, Node `node:test`, Mixbox 2.0, Cloudflare Pages.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/paint-engine.js` | MODIFY. Add `sampleLatent(buf,cx,cy,r)`; refactor `sampleSpot` to use it. |
| `test/paint-engine.test.js` | MODIFY. Tests for `sampleLatent`. |
| `src/brush.js` | NEW. Pure UMD brush model + `applyBrushDab`. `window.CordleBrush`. |
| `test/brush.test.js` | NEW. Brush unit tests. |
| `src/paint-template.html` | MODIFY. Wetness slider, carried-paint swatch, load meter, `//BRUSH` script block. |
| `src/paint-style.css` | MODIFY. Styles for swatch + load meter. |
| `src/paint-ui.js` | MODIFY (rewrite). Drive strokes via `CordleBrush`; render indicator. |
| `build.js` | MODIFY. Inline `src/brush.js` via `//BRUSH` token into `paint.html`. |
| `test/build.test.js` | MODIFY. Assert `paint.html` contains `CordleBrush`, no `//BRUSH` token. |

Paint page load order: `mixbox` → `CordleEngine` → `CordlePaint` → `CordleBrush` → paint-ui.

---

## Task 1: paint-engine `sampleLatent`

**Files:**
- Modify: `src/paint-engine.js`
- Modify: `test/paint-engine.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/paint-engine.test.js`:
```js
test('sampleLatent: zero weight on bare paper, positive on paint; z has length LATENT_SIZE', () => {
  const buf = P.createBuffer(41, 41);
  const empty = P.sampleLatent(buf, 20, 20, 6);
  assert.strictEqual(empty.weight, 0);
  assert.strictEqual(empty.z.length, P.LATENT_SIZE);
  P.addDab(buf, 20, 20, 10, 0.8, latentOf(YELLOW));
  const s = P.sampleLatent(buf, 20, 20, 6);
  assert.ok(s.weight > 0, `expected paint weight, got ${s.weight}`);
  assert.strictEqual(s.z.length, P.LATENT_SIZE);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/paint-engine.test.js`
Expected: FAIL — `P.sampleLatent is not a function`.

- [ ] **Step 3: Implement**

In `src/paint-engine.js`, add this function (place it right BEFORE the existing `sampleSpot`):
```js
  function sampleLatent(buf, cx, cy, r) {
    const { w, h, accum, weight } = buf;
    const z = new Array(L).fill(0);
    let wsum = 0;
    const { x0, x1, y0, y1 } = clipBounds(w, h, cx, cy, r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (Math.sqrt(dx * dx + dy * dy) > r) continue;
        const p = y * w + x;
        const base = p * L;
        for (let i = 0; i < L; i++) z[i] += accum[base + i];
        wsum += weight[p];
      }
    }
    if (wsum > 0) for (let i = 0; i < L; i++) z[i] /= wsum;
    return { z, weight: wsum };
  }
```
Then REPLACE the entire existing `sampleSpot` function body with a version that delegates to it:
```js
  function sampleSpot(buf, cx, cy, sampleRadius) {
    const s = sampleLatent(buf, cx, cy, sampleRadius);
    if (s.weight <= 0) return [255, 255, 255];
    const o = mixbox.latentToRgb(s.z);
    return [o[0], o[1], o[2]];
  }
```
Add `sampleLatent,` to the returned object (next to `sampleSpot`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/paint-engine.test.js`
Expected: PASS — the new test plus all existing paint-engine tests (the refactored `sampleSpot` must still satisfy its old tests).

- [ ] **Step 5: Commit**

```bash
git add src/paint-engine.js test/paint-engine.test.js
git commit -m "feat: add sampleLatent to paint engine; sampleSpot delegates to it"
```

---

## Task 2: brush model (state, load, bristles, taper)

**Files:**
- Create: `src/brush.js`
- Create: `test/brush.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/brush.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/brush.js');
const P = require('../src/paint-engine.js');

const YELLOW = [254, 236, 0];
const latentOf = (rgb) => P.pigmentLatents([{ name: 'x', rgb }])[0];

test('loadBrush sets carried color to the pigment and load to 1', () => {
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  assert.strictEqual(B.brushLoad(br), 1);
  const c = B.brushColor(br);
  assert.ok(c[0] > 200 && c[1] > 180 && c[2] < 40, `expected yellow-ish, got ${c}`);
});

test('empty brush has null color and zero load', () => {
  const br = B.createBrush();
  assert.strictEqual(B.brushColor(br), null);
  assert.strictEqual(B.brushLoad(br), 0);
});

test('bristleOffsets: count, within radius, deterministic, varied strengths', () => {
  const a = B.bristleOffsets(10, 42, 16);
  const b = B.bristleOffsets(10, 42, 16);
  assert.strictEqual(a.length, 16);
  assert.deepStrictEqual(a, b);
  assert.ok(a.every((o) => Math.sqrt(o.dx * o.dx + o.dy * o.dy) <= 10.0001), 'within radius');
  assert.ok(a.every((o) => o.strength >= 0.4 && o.strength <= 1.0), 'strength range');
  assert.ok(new Set(a.map((o) => o.strength)).size > 1, 'varied strengths');
});

test('speedTaper: monotonically decreasing within (0,1]', () => {
  assert.strictEqual(B.speedTaper(0), 1);
  assert.ok(B.speedTaper(5) < B.speedTaper(0));
  assert.ok(B.speedTaper(50) < B.speedTaper(5));
  assert.ok(B.speedTaper(1000) > 0 && B.speedTaper(50) <= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/brush.test.js`
Expected: FAIL — cannot find module `../src/brush.js`.

- [ ] **Step 3: Implement**

Create `src/brush.js`:
```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../mixbox.js'), require('./paint-engine.js'));
  } else {
    root.CordleBrush = factory(root.mixbox, root.CordlePaint);
  }
}(typeof self !== 'undefined' ? self : this, function (mixbox, paint) {
  'use strict';

  const L = mixbox.LATENT_SIZE;
  const DEFAULT_CAPACITY = 1.0;
  const BRISTLE_COUNT = 16;
  const BRISTLE_SUB = 0.35;  // bristle sub-radius as a fraction of brush radius
  const PICKUP_K = 0.5;      // wetness 1 => carried color blends 50% toward canvas
  const DEPOSIT_K = 1.0;
  const CONSUME_K = 0.03;    // load consumed per bristle deposit (controls run-out)
  const DRY = 1e-4;

  function createBrush() {
    return { accum: new Array(L).fill(0), weight: 0, capacity: DEFAULT_CAPACITY };
  }

  function loadBrush(brush, pigmentLatent, capacity) {
    const cap = capacity || DEFAULT_CAPACITY;
    brush.capacity = cap;
    brush.weight = cap;
    for (let i = 0; i < L; i++) brush.accum[i] = pigmentLatent[i] * cap;
  }

  function brushColor(brush) {
    if (brush.weight <= DRY) return null;
    const z = new Array(L);
    for (let i = 0; i < L; i++) z[i] = brush.accum[i] / brush.weight;
    const o = mixbox.latentToRgb(z);
    return [o[0], o[1], o[2]];
  }

  function brushLoad(brush) {
    if (!brush.capacity) return 0;
    return Math.max(0, Math.min(1, brush.weight / brush.capacity));
  }

  function bristleOffsets(radius, seed, count) {
    count = count || BRISTLE_COUNT;
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const out = [];
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.sqrt(rnd()) * radius; // uniform over the disc
      out.push({ dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad, strength: 0.4 + 0.6 * rnd() });
    }
    return out;
  }

  function speedTaper(speed) {
    return 1 / (1 + (speed || 0) * 0.05);
  }

  return {
    L, BRISTLE_COUNT, DEFAULT_CAPACITY,
    createBrush, loadBrush, brushColor, brushLoad, bristleOffsets, speedTaper,
  };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/brush.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/brush.js test/brush.test.js
git commit -m "feat: add brush model (load, carried color, bristles, speed taper)"
```

---

## Task 3: `applyBrushDab` (pickup, deposit, run-out)

**Files:**
- Modify: `src/brush.js`
- Modify: `test/brush.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/brush.test.js`:
```js
const BLUE = [25, 0, 89];

test('applyBrushDab deposits paint and depletes the brush', () => {
  const buf = P.createBuffer(41, 41);
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  const bristles = B.bristleOffsets(10, 7, 16);
  B.applyBrushDab(buf, br, 20, 20, { radius: 10, flow: 0.8, wetness: 0, bristles, speed: 0 });
  assert.notDeepStrictEqual(P.colorAt(buf, 20, 20), [255, 255, 255]);
  assert.ok(B.brushLoad(br) < 1, `load should drop, got ${B.brushLoad(br)}`);
});

test('run-out: repeated dabs without reload drive load to ~0 and stop changing canvas', () => {
  const buf = P.createBuffer(41, 41);
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  const bristles = B.bristleOffsets(8, 3, 16);
  for (let i = 0; i < 200; i++) B.applyBrushDab(buf, br, 20, 20, { radius: 8, flow: 1, wetness: 0, bristles, speed: 0 });
  assert.ok(B.brushLoad(br) < 0.05, `load should be ~0, got ${B.brushLoad(br)}`);
  const c1 = P.colorAt(buf, 20, 20);
  for (let i = 0; i < 20; i++) B.applyBrushDab(buf, br, 20, 20, { radius: 8, flow: 1, wetness: 0, bristles, speed: 0 });
  const c2 = P.colorAt(buf, 20, 20);
  assert.ok(Math.abs(c1[0] - c2[0]) <= 2 && Math.abs(c1[1] - c2[1]) <= 2 && Math.abs(c1[2] - c2[2]) <= 2,
    `dry brush should not change canvas: ${c1} vs ${c2}`);
});

test('pickup: high wetness tints carried color toward wet canvas; zero wetness keeps it', () => {
  const makeWetBlue = () => {
    const buf = P.createBuffer(81, 81);
    P.addDab(buf, 40, 40, 30, 1.0, latentOf(BLUE));
    return buf;
  };
  const bristles = B.bristleOffsets(10, 5, 16);

  let buf = makeWetBlue();
  let br = B.createBrush(); B.loadBrush(br, latentOf(YELLOW), 1);
  B.applyBrushDab(buf, br, 40, 40, { radius: 10, flow: 0.5, wetness: 1, bristles, speed: 0 });
  const cWet = B.brushColor(br);

  buf = makeWetBlue();
  br = B.createBrush(); B.loadBrush(br, latentOf(YELLOW), 1);
  B.applyBrushDab(buf, br, 40, 40, { radius: 10, flow: 0.5, wetness: 0, bristles, speed: 0 });
  const cDry = B.brushColor(br);

  assert.ok(cWet[1] > cWet[0], `wet brush should turn green-dominant, got ${cWet}`);
  assert.ok(cDry[0] >= cDry[1], `zero-wetness brush should stay yellowish, got ${cDry}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/brush.test.js`
Expected: FAIL — `B.applyBrushDab is not a function`.

- [ ] **Step 3: Implement**

In `src/brush.js`, add this function (before the `return`):
```js
  function applyBrushDab(buf, brush, cx, cy, opts) {
    const radius = opts.radius;
    const flow = opts.flow;
    const wetness = opts.wetness != null ? opts.wetness : 0;
    const bristles = opts.bristles || bristleOffsets(radius, 1, BRISTLE_COUNT);
    const taper = speedTaper(opts.speed || 0);
    const subR = Math.max(1, radius * BRISTLE_SUB);

    // Pickup once: tint the carried color toward the wet canvas under the footprint.
    const s = paint.sampleLatent(buf, cx, cy, radius);
    if (s.weight > 0) {
      const k = wetness * PICKUP_K;
      if (k > 0) {
        if (brush.weight > DRY) {
          for (let i = 0; i < L; i++) {
            const carried = brush.accum[i] / brush.weight;
            brush.accum[i] = ((1 - k) * carried + k * s.z[i]) * brush.weight;
          }
        } else {
          const gain = k * 0.5;
          for (let i = 0; i < L; i++) brush.accum[i] += gain * s.z[i];
          brush.weight += gain;
          if (!brush.capacity) brush.capacity = DEFAULT_CAPACITY;
        }
      }
    }

    // Deposit per bristle, scaled by remaining load; then deplete.
    for (const b of bristles) {
      if (brush.weight <= DRY) break;
      const bx = cx + b.dx, by = cy + b.dy;
      const dep = flow * b.strength * taper * DEPOSIT_K * brushLoad(brush);
      if (dep <= 0) continue;
      const carried = new Array(L);
      for (let i = 0; i < L; i++) carried[i] = brush.accum[i] / brush.weight;
      paint.addDab(buf, bx, by, subR, dep, carried);
      const before = brush.weight;
      brush.weight = Math.max(0, brush.weight - dep * CONSUME_K);
      const ratio = before > 0 ? brush.weight / before : 0;
      for (let i = 0; i < L; i++) brush.accum[i] *= ratio; // depletion keeps carried color
    }
  }
```
Add `applyBrushDab,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — all suites (engine, paint-engine incl. sampleLatent, brush incl. the 3 new tests, build).

- [ ] **Step 5: Commit**

```bash
git add src/brush.js test/brush.test.js
git commit -m "feat: add applyBrushDab with pickup, load-scaled deposit, and run-out"
```

---

## Task 4: Paint template + styling (wetness, indicator, brush script)

**Files:**
- Modify: `src/paint-template.html`
- Modify: `src/paint-style.css`

- [ ] **Step 1: Add the Wetness slider**

In `src/paint-template.html`, find:
```html
    <label>Flow <input type="range" id="flow" min="5" max="100" value="40" /></label>
  </div>
```
Replace with:
```html
    <label>Flow <input type="range" id="flow" min="5" max="100" value="40" /></label>
    <label>Wetness <input type="range" id="wet" min="0" max="100" value="50" /></label>
  </div>
  <div class="brushinfo">
    <span class="brushinfo-label">Brush</span>
    <div class="brush-swatch" id="brush-swatch"></div>
    <div class="load-track"><div class="load-fill" id="brush-load"></div></div>
  </div>
```

- [ ] **Step 2: Add the `//BRUSH` script block**

In `src/paint-template.html`, find:
```html
<script>
//PAINT-ENGINE
</script>
<script>
//PAINT-UI
</script>
```
Replace with:
```html
<script>
//PAINT-ENGINE
</script>
<script>
//BRUSH
</script>
<script>
//PAINT-UI
</script>
```

- [ ] **Step 3: Add styles**

Append to `src/paint-style.css`:
```css
.brushinfo { display: flex; align-items: center; gap: 0.6rem; justify-content: center; margin: 0.2rem 0 0.4rem; color: var(--muted); font-size: 0.8rem; }
.brush-swatch { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--line); background: transparent; }
.load-track { width: 120px; height: 8px; border-radius: 5px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }
.load-fill { height: 100%; width: 0%; background: var(--accent); transition: width 0.05s linear; }
```

- [ ] **Step 4: Commit**

```bash
git add src/paint-template.html src/paint-style.css
git commit -m "feat: add wetness slider and brush carried-color + load indicator"
```

---

## Task 5: Paint UI integration

**Files:**
- Modify (rewrite): `src/paint-ui.js`

- [ ] **Step 1: Replace `src/paint-ui.js` with this full content**

```js
(function () {
  'use strict';
  const P = window.CordlePaint;
  const E = window.CordleEngine;
  const Bsh = window.CordleBrush;

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
  const brush = Bsh.createBrush();

  let target = null;
  let selected = 0;
  let painting = false;
  let last = null;
  let strokeSeed = 1;
  let bristles = Bsh.bristleOffsets(16, strokeSeed, undefined);

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

  function controls() {
    return {
      radius: +$('size').value,
      flow: (+$('flow').value) / 100,
      wetness: (+$('wet').value) / 100,
    };
  }

  function updateBrushIndicator() {
    const c = Bsh.brushColor(brush);
    $('brush-swatch').style.background = c ? rgbCss(c) : 'transparent';
    $('brush-load').style.width = (Bsh.brushLoad(brush) * 100) + '%';
  }

  function dab(x, y, speed) {
    const { radius, flow, wetness } = controls();
    Bsh.applyBrushDab(buffer, brush, x, y, { radius, flow, wetness, bristles, speed });
    renderRegion(x, y, radius);
  }

  function dabLine(a, b) {
    const { radius } = controls();
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / Math.max(1, radius * 0.4)));
    for (let s = 1; s <= steps; s++) {
      dab(a.x + (dx * s) / steps, a.y + (dy * s) / steps, dist);
    }
    updateBrushIndicator();
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    painting = true;
    strokeSeed += 1;
    bristles = Bsh.bristleOffsets(+$('size').value, strokeSeed, undefined);
    const pt = toLogical(ev);
    last = pt;
    dab(pt.x, pt.y, 0);
    updateBrushIndicator();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    const pt = toLogical(ev);
    dabLine(last, pt);
    last = pt;
  });
  const endStroke = () => { painting = false; last = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', endStroke);

  function reload() {
    Bsh.loadBrush(brush, latents[selected]);
    updateBrushIndicator();
  }

  function renderPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    P.PAINT_PALETTE.forEach((pig, i) => {
      const el = document.createElement('div');
      el.className = 'pig' + (i === selected ? ' selected' : '');
      el.style.background = rgbCss(pig.rgb);
      el.title = pig.name;
      el.addEventListener('click', () => { selected = i; reload(); renderPalette(); });
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
    reload();
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

- [ ] **Step 2: Syntax check**

Run: `node -c src/paint-ui.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add src/paint-ui.js
git commit -m "feat: drive paint strokes through the loaded bristle brush"
```

---

## Task 6: Build + build test

**Files:**
- Modify: `build.js`
- Modify: `test/build.test.js`

- [ ] **Step 1: Write the failing test additions**

In `test/build.test.js`, find the `build produces a self-contained paint.html` test and add these two assertions inside it (after the existing `assert.ok(html.includes('CordlePaint'), ...)` line):
```js
  assert.ok(!html.includes('//BRUSH'), 'BRUSH placeholder not replaced');
  assert.ok(html.includes('CordleBrush'), 'brush module not inlined');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `//BRUSH` still present / `CordleBrush` not inlined (build.js doesn't inline it yet).

- [ ] **Step 3: Implement**

In `build.js`, find the `paint.html` token list:
```js
build('src/paint-template.html', 'paint.html', [
  ['/*PAINT-STYLE*/', 'src/paint-style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//PAINT-ENGINE', 'src/paint-engine.js'],
  ['//PAINT-UI', 'src/paint-ui.js'],
]);
```
Replace with (add the `//BRUSH` entry between paint-engine and paint-ui):
```js
build('src/paint-template.html', 'paint.html', [
  ['/*PAINT-STYLE*/', 'src/paint-style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//PAINT-ENGINE', 'src/paint-engine.js'],
  ['//BRUSH', 'src/brush.js'],
  ['//PAINT-UI', 'src/paint-ui.js'],
]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — all suites green.

- [ ] **Step 5: Verify Mixbox integrity in built paint page**

Run:
```bash
node build.js
wc -c paint.html
grep -c 'decompress' paint.html
grep -c 'CordleBrush' paint.html
```
Expected: paint.html > 190000 bytes; `decompress` >= 1; `CordleBrush` >= 1.

- [ ] **Step 6: Commit**

```bash
git add build.js test/build.test.js index.html paint.html
git commit -m "feat: inline brush.js into paint.html"
```

---

## Task 7: Verify and deploy

**Files:** Create `/tmp/brush-smoke.js` (throwaway)

- [ ] **Step 1: Headless smoke harness**

Create `/tmp/brush-smoke.js`:
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
    getContext() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }; },
    get children() { return this._children; },
    click() { if (this._lis.click) this._lis.click(); },
  };
  Object.defineProperty(el, 'textContent', { get() { return this._text; }, set(v) { this._text = v; } });
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; if (v === '') this._children = []; } });
  Object.defineProperty(el, 'value', { get() { return this._v != null ? this._v : '16'; }, set(v) { this._v = v; } });
  return el;
}

const ids = ['paint-canvas','spot','target','spot-readout','palette','size','flow','wet','lock','clear','new','result','best','brush-swatch','brush-load'];
const els = {}; ids.forEach((id) => { els[id] = makeEl(); });
els.size._v = '16'; els.flow._v = '40'; els.wet._v = '50';

const localStorage = { store: {}, getItem(k) { return k in this.store ? this.store[k] : null; }, setItem(k, v) { this.store[k] = String(v); } };
const document = { getElementById: (id) => els[id], createElement: () => makeEl() };
const sandbox = { console, document, localStorage, mixbox, Math, JSON, Array, Object, Set, Number, String, Float32Array, Uint8ClampedArray };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const load = (f) => vm.runInContext('var module=undefined;' + fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
load('src/engine.js'); load('src/paint-engine.js'); load('src/brush.js');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/paint-ui.js'), 'utf8'), sandbox, { filename: 'paint-ui.js' });

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

check(!!sandbox.CordleBrush, 'CordleBrush global present');
check(els['brush-swatch'].style.background && els['brush-swatch'].style.background.startsWith('rgb'), 'brush swatch shows carried color: ' + els['brush-swatch'].style.background);
check(els['brush-load'].style.width === '100%', 'load meter starts full: ' + els['brush-load'].style.width);

// Paint a stroke over the spot.
els.palette.children[2].click(); // select blue, reloads
const cv = els['paint-canvas'];
cv._lis.pointerdown({ pointerId: 1, clientX: 205, clientY: 210 });
for (let i = 0; i < 12; i++) cv._lis.pointermove({ pointerId: 1, clientX: 205 + i, clientY: 210 });
cv._lis.pointerup({ pointerId: 1 });
check(/\d+%$/.test(els['brush-load'].style.width), 'load meter is a percent: ' + els['brush-load'].style.width);
check(parseFloat(els['brush-load'].style.width) < 100, 'load dropped after stroke: ' + els['brush-load'].style.width);
els.lock.click();
check(/\d+%/.test(els.result._html), 'lock-in produced a score: ' + els.result._html);
check(/Best match: \d+%/.test(els.best._text), 'best score shown: ' + els.best._text);

els.clear.click();
check(els.result._html === '', 'clear resets result');

console.log(`\nBRUSH SMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run smoke + full suite**

Run:
```bash
node /tmp/brush-smoke.js
node --test
```
Expected: `BRUSH SMOKE: 8 passed, 0 failed`; full suite all green. If the stub trips on an unsupported DOM feature (not a real bug), note it and rely on unit tests + manual.

- [ ] **Step 3: Build, stage, deploy**

Run:
```bash
node build.js
mkdir -p public
cp index.html public/index.html
cp paint.html public/paint.html
set -a; . /home/jarred/code/loe-vibecode/.env; set +a; export CLOUDFLARE_API_TOKEN
npx wrangler pages deploy public --project-name cordle --branch main
```
Expected: "Deployment complete".

- [ ] **Step 4: Verify live**

Run:
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}  %{size_download} bytes\n" https://cordle.pages.dev/paint
curl -sS https://cordle.pages.dev/paint | grep -oE 'CordleBrush|id="wet"|brush-swatch' | sort -u
```
Expected: HTTP 200; `CordleBrush`, `id="wet"`, `brush-swatch` present.

- [ ] **Step 5: Manual verification**

On `https://cordle.pages.dev/paint`:
- Strokes show bristle streaks / broken edges (not a clean disc).
- Dragging one color through another smears/blends; the carried-color swatch drifts.
- The load meter drains as you paint; tapping a pigment refills it; the stroke fades as it runs dry.
- The Wetness slider visibly changes smear strength; fast flicks taper.
- Lock-in scoring and Best persist; Clear and New target work; nav links work.

---

## Self-Review Notes

- **Spec coverage:** carried-paint reservoir model (Task 2), pickup/smear non-destructive (Task 3, uses `sampleLatent`), load + run-out (Task 3), bristle texture (Task 2 `bristleOffsets` + Task 3 per-bristle deposit), speed taper (Task 2 `speedTaper` + Task 5 passing `dist` as speed), Size/Flow/Wetness controls + carried swatch + load meter (Tasks 4-5), replace old brush (Task 5 rewrite), `paint.html`-only + inline brush.js (Tasks 4,6), deploy + push (Task 7). All covered.
- **Type consistency:** brush object `{accum, weight, capacity}` consistent across all brush functions; `applyBrushDab` opts `{radius, flow, wetness, bristles, speed}` matches the UI call site; `sampleLatent` returns `{z, weight}` consumed by `applyBrushDab`; globals `CordlePaint`/`CordleBrush`/`CordleEngine` match template load order.
- **No placeholders:** all code complete; `//BRUSH` etc. are intentional template tokens asserted-removed by the build test.
- **Push note:** Task 7 deploys; the controller merges the branch and pushes to GitHub via finishing-a-development-branch after all tasks.
```
