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
      return Array.from(z);
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
