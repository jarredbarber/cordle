const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'index.html');

test('build produces a self-contained index.html', () => {
  execSync('node build.js', { cwd: ROOT });
  const html = fs.readFileSync(OUT, 'utf8');

  // No unresolved placeholder tokens remain.
  assert.ok(!html.includes('/*STYLE*/'), 'STYLE placeholder not replaced');
  assert.ok(!html.includes('//MIXBOX'), 'MIXBOX placeholder not replaced');
  assert.ok(!html.includes('//ENGINE'), 'ENGINE placeholder not replaced');
  assert.ok(!html.includes('//UI'), 'UI placeholder not replaced');

  // Inlined content is present.
  assert.ok(html.includes('MIXBOX 2.0'), 'Mixbox engine not inlined');
  assert.ok(html.includes('CordleEngine'), 'engine not inlined');
  assert.ok(html.includes('generatePuzzle'), 'engine logic not inlined');

  // No external resource references in the body scripts/links.
  assert.ok(!/<script[^>]*\ssrc=/.test(html), 'unexpected external script src');
  assert.ok(!/<link[^>]*stylesheet/.test(html), 'unexpected external stylesheet');

  // Reasonable size (engine + mixbox).
  assert.ok(html.length > 150000, `index.html too small: ${html.length}`);
});
