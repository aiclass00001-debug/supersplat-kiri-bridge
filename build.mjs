import { access, rm, mkdir, cp, rename } from 'node:fs/promises';

const OUT = new URL('./dist/', import.meta.url);
const SRC = new URL('./src/', import.meta.url);
const VIEWER = new URL('./node_modules/@playcanvas/supersplat-viewer/public/', import.meta.url);

// Validate the pinned package's documented standalone distribution before
// removing the previous build. Copy ALL runtime assets, including WASM.
for (const file of ['index.html', 'index.css', 'index.js']) {
  await access(new URL(file, VIEWER));
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(VIEWER, OUT, { recursive: true });

// Preserve the existing same-origin iframe URL and relative asset paths.
await rename(new URL('index.html', OUT), new URL('viewer.html', OUT));

// Copy our surrounding GS Bridge UI.
for (const file of ['index.html', 'app.js', 'styles.css', 'gestureControl.js', 'gsBridgeAdapter.js', 'settings.json', 'sogDataLoader.js', 'particleSystem.js', 'modeController.js']) {
  await cp(new URL(file, SRC), new URL(file, OUT));
}

console.log('Built dist/: GS Bridge shell + complete official SuperSplat Viewer distribution (viewer.html).');
