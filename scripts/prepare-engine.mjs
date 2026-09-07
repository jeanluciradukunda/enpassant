import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('stockfish/package.json'));
const target = new URL('../public/engine/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  await copyFile(join(root, 'bin', name), new URL(name, target));
}
await copyFile(join(root, 'Copying.txt'), new URL('COPYING.txt', target));
// Stockfish's download promise can reject without firing Worker.onerror.
// Relay that failure so the UI can recover immediately rather than waiting
// for the UCI handshake timeout. The vendor files remain unmodified.
await writeFile(
  new URL('stockfish-worker.js', target),
  `
self.addEventListener('unhandledrejection', (event) => {
  self.postMessage('enpassant:engine-error');
  event.preventDefault();
});
try { importScripts('./stockfish-18-lite-single.js'); }
catch { self.postMessage('enpassant:engine-error'); }
`,
);
console.log('Stockfish 18 lite single-thread engine ready.');
