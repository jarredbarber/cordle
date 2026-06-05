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
  const BRISTLE_SUB = 0.35;
  const PICKUP_K = 0.5;
  const DEPOSIT_K = 1.0;
  const CONSUME_K = 0.03;
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
      const rad = Math.sqrt(rnd()) * radius;
      out.push({ dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad, strength: 0.4 + 0.6 * rnd() });
    }
    return out;
  }

  function speedTaper(speed) {
    return 1 / (1 + (speed || 0) * 0.05);
  }

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
      for (let i = 0; i < L; i++) brush.accum[i] *= ratio;
    }
  }

  return {
    L, BRISTLE_COUNT, DEFAULT_CAPACITY,
    createBrush, loadBrush, brushColor, brushLoad, bristleOffsets, speedTaper,
    applyBrushDab,
  };
}));
