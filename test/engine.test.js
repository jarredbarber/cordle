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
