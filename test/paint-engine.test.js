const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/paint-engine.js');

const YELLOW = [254, 236, 0];
const BLUE = [25, 0, 89];
const close = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

function latentOf(rgb) {
  return P.pigmentLatents([{ name: 'x', rgb }])[0];
}

test('createBuffer: correct dimensions and zeroed', () => {
  const buf = P.createBuffer(4, 3);
  assert.strictEqual(buf.w, 4);
  assert.strictEqual(buf.h, 3);
  assert.strictEqual(buf.weight.length, 12);
  assert.strictEqual(buf.accum.length, 12 * P.LATENT_SIZE);
  assert.strictEqual(buf.weight[0], 0);
});

test('colorAt: unpainted pixel reads paper white', () => {
  const buf = P.createBuffer(10, 10);
  assert.deepStrictEqual(P.colorAt(buf, 5, 5), [255, 255, 255]);
});

test('addDab + colorAt: single pigment at center is that pigment color', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(YELLOW));
  assert.ok(close(P.colorAt(buf, 10, 10), YELLOW), `got ${P.colorAt(buf, 10, 10)}`);
});

test('addDab twice: yellow then blue at center mixes to green-dominant', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(YELLOW));
  P.addDab(buf, 10, 10, 5, 0.5, latentOf(BLUE));
  const c = P.colorAt(buf, 10, 10);
  assert.ok(c[1] > c[0] && c[1] > c[2], `expected green dominant, got ${c}`);
});

test('addDab: soft falloff means center weight exceeds edge weight', () => {
  const buf = P.createBuffer(21, 21);
  P.addDab(buf, 10, 10, 8, 1.0, latentOf(YELLOW));
  const wCenter = buf.weight[10 * 21 + 10];
  const wEdge = buf.weight[10 * 21 + 17]; // 7px from center, radius 8
  assert.ok(wCenter > wEdge && wEdge > 0, `center ${wCenter} edge ${wEdge}`);
});

test('clearBuffer: resets to white/zero', () => {
  const buf = P.createBuffer(10, 10);
  P.addDab(buf, 5, 5, 4, 1.0, latentOf(YELLOW));
  P.clearBuffer(buf);
  assert.strictEqual(buf.weight[5 * 10 + 5], 0);
  assert.deepStrictEqual(P.colorAt(buf, 5, 5), [255, 255, 255]);
});

test('sampleSpot: averages a single-pigment region to that pigment; white if unpainted', () => {
  const buf = P.createBuffer(41, 41);
  assert.deepStrictEqual(P.sampleSpot(buf, 20, 20, 6), [255, 255, 255]);
  P.addDab(buf, 20, 20, 10, 0.8, latentOf(YELLOW));
  assert.ok(close(P.sampleSpot(buf, 20, 20, 6), YELLOW), `got ${P.sampleSpot(buf, 20, 20, 6)}`);
});
