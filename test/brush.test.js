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

const BLUE = [25, 0, 89];

test('applyBrushDab deposits paint and depletes the brush', () => {
  const buf = P.createBuffer(41, 41);
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  const bristles = B.bristleOffsets(10, 7, 16);
  B.applyBrushDab(buf, br, 20, 20, { radius: 10, flow: 0.8, wetness: 0, bristles, speed: 0 });
  assert.notDeepStrictEqual(P.colorAt(buf, 20, 20), [255, 255, 255]);
  assert.ok(B.brushLoad(br) < 1, `load should drop, got ${B.brushLoad(br)}`);
});

test('run-out: repeated dabs without reload drive load to ~0 and stop changing canvas', () => {
  const buf = P.createBuffer(41, 41);
  const br = B.createBrush();
  B.loadBrush(br, latentOf(YELLOW), 1);
  const bristles = B.bristleOffsets(8, 3, 16);
  for (let i = 0; i < 200; i++) B.applyBrushDab(buf, br, 20, 20, { radius: 8, flow: 1, wetness: 0, bristles, speed: 0 });
  assert.ok(B.brushLoad(br) < 0.05, `load should be ~0, got ${B.brushLoad(br)}`);
  const c1 = P.colorAt(buf, 20, 20);
  for (let i = 0; i < 20; i++) B.applyBrushDab(buf, br, 20, 20, { radius: 8, flow: 1, wetness: 0, bristles, speed: 0 });
  const c2 = P.colorAt(buf, 20, 20);
  assert.ok(Math.abs(c1[0] - c2[0]) <= 2 && Math.abs(c1[1] - c2[1]) <= 2 && Math.abs(c1[2] - c2[2]) <= 2,
    `dry brush should not change canvas: ${c1} vs ${c2}`);
});

test('pickup: high wetness tints carried color toward wet canvas; zero wetness keeps it', () => {
  const makeWetBlue = () => {
    const buf = P.createBuffer(81, 81);
    P.addDab(buf, 40, 40, 30, 1.0, latentOf(BLUE));
    return buf;
  };
  const bristles = B.bristleOffsets(10, 5, 16);

  let buf = makeWetBlue();
  let br = B.createBrush(); B.loadBrush(br, latentOf(YELLOW), 1);
  B.applyBrushDab(buf, br, 40, 40, { radius: 10, flow: 0.5, wetness: 1, bristles, speed: 0 });
  const cWet = B.brushColor(br);

  buf = makeWetBlue();
  br = B.createBrush(); B.loadBrush(br, latentOf(YELLOW), 1);
  B.applyBrushDab(buf, br, 40, 40, { radius: 10, flow: 0.5, wetness: 0, bristles, speed: 0 });
  const cDry = B.brushColor(br);

  assert.ok(cWet[1] > cWet[0], `wet brush should turn green-dominant, got ${cWet}`);
  assert.ok(cDry[0] >= cDry[1], `zero-wetness brush should stay yellowish, got ${cDry}`);
});
