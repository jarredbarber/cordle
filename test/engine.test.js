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

function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

test('PIGMENTS pool has at least 10 distinct named pigments', () => {
  assert.ok(E.PIGMENTS.length >= 10);
  assert.strictEqual(new Set(E.PIGMENTS.map((p) => p.name)).size, E.PIGMENTS.length);
  for (const p of E.PIGMENTS) {
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.ok(Array.isArray(p.rgb) && p.rgb.length === 3);
  }
});

test('generatePuzzle: palette of 8 distinct pigments', () => {
  const p = E.generatePuzzle(E.PIGMENTS, seededRng(42));
  assert.strictEqual(p.palette.length, 8);
  assert.strictEqual(new Set(p.palette.map((x) => x.name)).size, 8);
});

test('generatePuzzle: answer is 2-4 indices within the palette', () => {
  const p = E.generatePuzzle(E.PIGMENTS, seededRng(7));
  assert.ok(p.answerIndices.length >= 2 && p.answerIndices.length <= 4);
  assert.ok(p.answerIndices.every((i) => i >= 0 && i < 8));
  assert.strictEqual(new Set(p.answerIndices).size, p.answerIndices.length);
});

test('generatePuzzle: target equals the mix of the answer pigments', () => {
  const p = E.generatePuzzle(E.PIGMENTS, seededRng(99));
  const expected = E.mixSubset(p.answerIndices.map((i) => p.palette[i].rgb));
  assert.deepStrictEqual(p.target, expected);
});
