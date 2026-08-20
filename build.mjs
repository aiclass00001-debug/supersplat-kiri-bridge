import { rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { html, css, js } from '@playcanvas/supersplat-viewer';

const OUT = new URL('./dist/', import.meta.url);
const SRC = new URL('./src/', import.meta.url);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// Official @playcanvas/supersplat-viewer HTML already references:
//   ./index.css
//   ./index.js
// Therefore emit all three official files unchanged.
// This matches the package's documented embedding contract.
await writeFile(new URL('viewer.html', OUT), html, 'utf8');
await writeFile(new URL('index.css', OUT), css, 'utf8');
await writeFile(new URL('index.js', OUT), js, 'utf8');

// Copy our surrounding GS Bridge UI.
for (const file of ['index.html', 'app.js', 'styles.css']) {
  await cp(new URL(file, SRC), new URL(file, OUT));
}

console.log('Built dist/:');
console.log(' - index.html      (GS Bridge shell)');
console.log(' - app.js');
console.log(' - styles.css');
console.log(' - viewer.html     (official SuperSplat Viewer)');
console.log(' - index.css       (official Viewer CSS)');
console.log(' - index.js        (official Viewer JS)');
