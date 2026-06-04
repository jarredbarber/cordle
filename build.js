const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('src/template.html');
// Use function replacements so `$` in the Mixbox LUT is not treated as a
// special replacement pattern by String.prototype.replace.
html = html.replace('/*STYLE*/', () => read('src/style.css'));
html = html.replace('//MIXBOX', () => read('mixbox.js'));
html = html.replace('//ENGINE', () => read('src/engine.js'));
html = html.replace('//UI', () => read('src/ui.js'));

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Built index.html (${html.length} bytes)`);
