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
  function matchPercent(rgb1, rgb2) {
    const d = deltaE(rgbToLab(rgb1), rgbToLab(rgb2));
    return Math.max(0, Math.min(100, Math.round(100 * (1 - d / DE_MAX))));
  }

  return { mixSubset, rgbToLab, deltaE, matchPercent };
}));
