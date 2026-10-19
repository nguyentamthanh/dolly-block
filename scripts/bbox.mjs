// Bounding box of pure-white pixels in a region of two images: node scripts/bbox.mjs x y w h a.png b.png
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [xs, ys, ws, hs, ...files] = process.argv.slice(2);
const [x0, y0, w, h] = [+xs, +ys, +ws, +hs];
for (const f of files) {
  const img = PNG.sync.read(readFileSync(f));
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * img.width + x) * 4;
    if (img.data[i] > 245 && img.data[i + 1] > 245 && img.data[i + 2] > 245) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
  }
  console.log(f.split(/[\/]/).slice(-2).join('/'), `x ${minx}..${maxx}  y ${miny}..${maxy}`);
}
