const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Use function replacements so `$` in the Mixbox LUT is not treated as a
// special replacement pattern by String.prototype.replace.
function build(template, outfile, tokens) {
  let html = read(template);
  for (const [token, file] of tokens) html = html.replace(token, () => read(file));
  fs.writeFileSync(path.join(root, outfile), html);
  console.log(`Built ${outfile} (${html.length} bytes)`);
}

build('src/template.html', 'index.html', [
  ['/*STYLE*/', 'src/style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//UI', 'src/ui.js'],
]);

build('src/paint-template.html', 'paint.html', [
  ['/*PAINT-STYLE*/', 'src/paint-style.css'],
  ['//MIXBOX', 'mixbox.js'],
  ['//ENGINE', 'src/engine.js'],
  ['//PAINT-ENGINE', 'src/paint-engine.js'],
  ['//PAINT-UI', 'src/paint-ui.js'],
]);
