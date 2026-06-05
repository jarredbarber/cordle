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

  return {
    L, BRISTLE_COUNT, DEFAULT_CAPACITY,
    createBrush, loadBrush, brushColor, brushLoad, bristleOffsets, speedTaper,
  };
}));
