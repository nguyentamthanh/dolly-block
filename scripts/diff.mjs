// Pixel diff of two PNGs: node scripts/diff.mjs <a.png> <b.png> [diff.png] [threshold=0.1]
// Prints the share of differing pixels and writes a visual diff.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [a, b, out, thr = '0.1'] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node scripts/diff.mjs <a.png> <b.png> [diff.png] [threshold]');
  process.exit(2);
}
const A = PNG.sync.read(readFileSync(a));
const B = PNG.sync.read(readFileSync(b));
if (A.width !== B.width || A.height !== B.height) {
  console.log(`size mismatch: ${A.width}x${A.height} vs ${B.width}x${B.height}`);
  process.exit(1);
}
const D = new PNG({ width: A.width, height: A.height });
const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: Number(thr), includeAA: false });
const pct = (n / (A.width * A.height)) * 100;
console.log(`diff ${n} px (${pct.toFixed(3)}%)`);
if (out) writeFileSync(out, PNG.sync.write(D));
