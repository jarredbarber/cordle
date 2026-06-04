const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine.js');

test('mixSubset: yellow + blue yields a green-dominant mix', () => {
  const mix = E.mixSubset([[252, 211, 0], [0, 33, 133]]);
  assert.ok(Array.isArray(mix) && mix.length === 3);
  assert.ok(mix[1] > mix[0] && mix[1] > mix[2], `expected green dominant, got ${mix}`);
});

test('mixSubset: single color is identity (round-trips through latent)', () => {
  assert.deepStrictEqual(E.mixSubset([[123, 45, 200]]), [123, 45, 200]);
});

test('mixSubset: empty selection returns null', () => {
  assert.strictEqual(E.mixSubset([]), null);
  assert.strictEqual(E.mixSubset(null), null);
});

test('matchPercent: identical colors are 100%', () => {
  assert.strictEqual(E.matchPercent([10, 20, 30], [10, 20, 30]), 100);
});

test('matchPercent: black vs white is near 0%', () => {
  assert.ok(E.matchPercent([0, 0, 0], [255, 255, 255]) < 10);
});

test('matchPercent: close colors score higher than far colors', () => {
  const near = E.matchPercent([100, 100, 100], [110, 100, 100]);
  const far = E.matchPercent([100, 100, 100], [200, 50, 10]);
  assert.ok(near > far);
});

test('rgbToLab + deltaE: identical colors have zero distance', () => {
  assert.strictEqual(E.deltaE(E.rgbToLab([50, 80, 120]), E.rgbToLab([50, 80, 120])), 0);
});
