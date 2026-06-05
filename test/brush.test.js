const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/brush.js');
const P = require('../src/paint-engine.js');

const YELLOW = [254, 236, 0];
const latentOf = (rgb) => P.pigmentLatents([{ name: 'x', rgb }])[0];

test('loadBrush sets carried color to the pigment and load to 1', () => {
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  assert.strictEqual(B.brushLoad(br), 1);
  const c = B.brushColor(br);
  assert.ok(c[0] > 200 && c[1] > 180 && c[2] < 40, `expected yellow-ish, got ${c}`);
});

test('empty brush has null color and zero load', () => {
  const br = B.createBrush();
  assert.strictEqual(B.brushColor(br), null);
  assert.strictEqual(B.brushLoad(br), 0);
});

test('bristleOffsets: count, within radius, deterministic, varied strengths', () => {
  const a = B.bristleOffsets(10, 42, 16);
  const b = B.bristleOffsets(10, 42, 16);
  assert.strictEqual(a.length, 16);
  assert.deepStrictEqual(a, b);
  assert.ok(a.every((o) => Math.sqrt(o.dx * o.dx + o.dy * o.dy) <= 10.0001), 'within radius');
  assert.ok(a.every((o) => o.strength >= 0.4 && o.strength <= 1.0), 'strength range');
  assert.ok(new Set(a.map((o) => o.strength)).size > 1, 'varied strengths');
});

test('speedTaper: monotonically decreasing within (0,1]', () => {
  assert.strictEqual(B.speedTaper(0), 1);
  assert.ok(B.speedTaper(5) < B.speedTaper(0));
  assert.ok(B.speedTaper(50) < B.speedTaper(5));
  assert.ok(B.speedTaper(1000) > 0 && B.speedTaper(50) <= 1);
});
