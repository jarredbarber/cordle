const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/paint-engine.js');

const YELLOW = [254, 236, 0];
const BLUE = [25, 0, 89];
const close = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

function latentOf(rgb) {
  return P.pigmentLatents([{ name: 'x', rgb }])[0];
}

test('addDab: zero radius deposits nothing and never produces NaN', () => {
  const buf = P.createBuffer(11, 11);
  P.addDab(buf, 5, 5, 0, 1.0, latentOf(YELLOW));
  assert.strictEqual(buf.weight[5 * 11 + 5], 0);
  assert.deepStrictEqual(P.colorAt(buf, 5, 5), [255, 255, 255]);
});

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

function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

test('generateTarget: normalized weights, >=2 contributors, valid rgb', () => {
  const t = P.generateTarget(P.PAINT_PALETTE, seededRng(3));
  assert.strictEqual(t.weights.length, P.PAINT_PALETTE.length);
  const sum = t.weights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `weights sum ${sum}`);
  assert.ok(t.weights.filter((x) => x >= 0.15).length >= 2, 'needs >=2 real contributors');
  assert.ok(Array.isArray(t.rgb) && t.rgb.length === 3);
  assert.ok(t.rgb.every((v) => v >= 0 && v <= 255));
});

test('generateTarget: reachable — painting the target weights at a spot matches rgb', () => {
  const t = P.generateTarget(P.PAINT_PALETTE, seededRng(11));
  const latents = P.pigmentLatents(P.PAINT_PALETTE);
  const buf = P.createBuffer(11, 11);
  t.weights.forEach((wgt, k) => {
    if (wgt > 0) P.addDab(buf, 5, 5, 1, wgt, latents[k]);
  });
  const c = P.colorAt(buf, 5, 5);
  assert.ok(c.every((v, i) => Math.abs(v - t.rgb[i]) <= 2), `reachable mismatch ${c} vs ${t.rgb}`);
});
