// Crop + enlarge a region, optionally side by side with a second image:
//   node scripts/crop.mjs <out.png> <x> <y> <w> <h> <scale> <a.png> [b.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [out, xs, ys, ws, hs, ss, ...files] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, s = +ss;
const imgs = files.map((f) => PNG.sync.read(readFileSync(f)));
const gap = 8;
const O = new PNG({ width: (w * s + gap) * imgs.length - gap, height: h * s });
O.data.fill(255);
imgs.forEach((img, k) => {
  for (let j = 0; j < h * s; j++) {
    for (let i = 0; i < w * s; i++) {
      const sx = x + Math.floor(i / s), sy = y + Math.floor(j / s);
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (j * O.width + k * (w * s + gap) + i) * 4;
      O.data[di] = img.data[si]; O.data[di + 1] = img.data[si + 1]; O.data[di + 2] = img.data[si + 2]; O.data[di + 3] = 255;
    }
  }
});
writeFileSync(out, PNG.sync.write(O));
console.log('wrote', out);
