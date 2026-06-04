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

  return { mixSubset };
}));
