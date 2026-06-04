(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../mixbox.js'));
  } else {
    root.CordleEngine = factory(root.mixbox);
  }
}(typeof self !== 'undefined' ? self : this, function (mixbox) {
  'use strict';

  function mixSubset(rgbList) {
    if (!rgbList || rgbList.length === 0) return null;
    const zMix = new Array(mixbox.LATENT_SIZE).fill(0);
    for (const rgb of rgbList) {
      const z = mixbox.rgbToLatent(rgb[0], rgb[1], rgb[2]);
      for (let i = 0; i < zMix.length; i++) zMix[i] += z[i] / rgbList.length;
    }
    const out = mixbox.latentToRgb(zMix);
    return [out[0], out[1], out[2]];
  }

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(rgb) {
    const R = srgbToLinear(rgb[0]), G = srgbToLinear(rgb[1]), B = srgbToLinear(rgb[2]);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) * 100;
    let Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) * 100;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) * 100;
    X /= 95.047; Y /= 100; Z /= 108.883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE(lab1, lab2) {
    return Math.sqrt(
      (lab1[0] - lab2[0]) ** 2 + (lab1[1] - lab2[1]) ** 2 + (lab1[2] - lab2[2]) ** 2
    );
  }

  const DE_MAX = 100;
  // Returns an integer 0-100 (100 = identical color).
  function matchPercent(rgb1, rgb2) {
    const d = deltaE(rgbToLab(rgb1), rgbToLab(rgb2));
    return Math.max(0, Math.min(100, Math.round(100 * (1 - d / DE_MAX))));
  }

  const PIGMENTS = [
    { name: 'Cadmium Yellow', rgb: [254, 236, 0] },
    { name: 'Hansa Yellow', rgb: [252, 211, 0] },
    { name: 'Cadmium Orange', rgb: [255, 105, 0] },
    { name: 'Cadmium Red', rgb: [255, 39, 2] },
    { name: 'Quinacridone Magenta', rgb: [128, 2, 46] },
    { name: 'Cobalt Blue', rgb: [0, 33, 133] },
    { name: 'Ultramarine Blue', rgb: [25, 0, 89] },
    { name: 'Phthalo Blue', rgb: [13, 27, 68] },
    { name: 'Phthalo Green', rgb: [0, 60, 50] },
    { name: 'Permanent Green', rgb: [7, 109, 22] },
    { name: 'Sap Green', rgb: [107, 148, 4] },
    { name: 'Burnt Sienna', rgb: [123, 72, 0] },
    { name: 'Titanium White', rgb: [243, 243, 243] },
    { name: 'Ivory Black', rgb: [0, 0, 0] },
  ];

  function sampleIndices(length, k, rng) {
    const idx = Array.from({ length }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, k);
  }

  const PALETTE_SIZE = 8;
  function generatePuzzle(pool, rng) {
    rng = rng || Math.random;
    const palette = sampleIndices(pool.length, PALETTE_SIZE, rng).map((i) => pool[i]);
    const answerSize = 2 + Math.floor(rng() * 3); // 2, 3, or 4
    const answerIndices = sampleIndices(PALETTE_SIZE, answerSize, rng).sort((a, b) => a - b);
    const target = mixSubset(answerIndices.map((i) => palette[i].rgb));
    return { palette, answerIndices, target };
  }

  function setsEqual(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }

  function evaluateGuess(selectedIndices, answerIndices, palette, target) {
    const perSwatch = selectedIndices.map((i) => ({
      index: i,
      inAnswer: answerIndices.includes(i),
    }));
    const mixedRgb = mixSubset(selectedIndices.map((i) => palette[i].rgb));
    const match = mixedRgb ? matchPercent(mixedRgb, target) : 0;
    const win = setsEqual(selectedIndices, answerIndices);
    return { perSwatch, mixedRgb, match, win };
  }

  return { mixSubset, rgbToLab, deltaE, matchPercent, PIGMENTS, generatePuzzle, evaluateGuess };
}));
