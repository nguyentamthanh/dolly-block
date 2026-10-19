// Builds the web-ready assets in public/ from the source art in assets-src/:
//   - the four home-screen paintings: PNG -> WebP (q92, visually lossless, ~100 KB each instead of ~1.3 MB)
//   - Fredoka (variable, only the 400-600 weights the game uses) and Noto Sans (fallback for Cyrillic, Turkish,
//     Vietnamese ...): subset to the scripts the game can show, as WOFF2
// Run: npm run assets
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import subsetFont from 'subset-font';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'assets-src');
const pub = join(root, 'public');
mkdirSync(join(pub, 'art'), { recursive: true });
mkdirSync(join(pub, 'fonts'), { recursive: true });

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// --- images ----------------------------------------------------------------------------------------------------
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY ?? 92);
let imgTotal = 0;
for (const name of ['home_bg', 'home_bg_34', 'home_bg_sq', 'home_bg_wide']) {
  const input = join(src, 'home', `${name}.png`);
  const out = join(pub, 'art', `${name}.webp`);
  const buf = await sharp(input).webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: false }).toBuffer();
  writeFileSync(out, buf);
  imgTotal += buf.length;
  console.log(`${name}.png ${kb(statSync(input).size)} -> ${name}.webp ${kb(buf.length)}`);
}
console.log(`art total ${kb(imgTotal)} (the game loads one of them)`);

// --- fonts -----------------------------------------------------------------------------------------------------
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join('');
const TEXT = [
  range(0x20, 0x7e), // ASCII
  range(0xa0, 0x17f), // Latin-1 + Latin Extended-A (German, French, Spanish, Portuguese, Turkish)
  range(0x180, 0x24f), // Latin Extended-B
  range(0x1ea0, 0x1ef9), // Vietnamese
  range(0x300, 0x30f), // combining marks (decomposed accents)
  range(0x400, 0x4ff), // Cyrillic
  range(0x2010, 0x2027), // dashes, quotes, bullets, ellipsis
  range(0x2030, 0x203a),
  '€№™←↑→↓−·•',
].join('');

const fonts = [
  { file: 'Fredoka.ttf', out: 'Fredoka.woff2', variationAxes: { wght: { min: 400, max: 600 } } },
  { file: 'NotoSans-Regular.ttf', out: 'NotoSans-Regular.woff2' },
  { file: 'NotoSans-Bold.ttf', out: 'NotoSans-Bold.woff2' },
];
let fontTotal = 0;
for (const f of fonts) {
  const input = join(src, 'fonts', f.file);
  const buf = await subsetFont(readFileSync(input), TEXT, { targetFormat: 'woff2', ...(f.variationAxes ? { variationAxes: f.variationAxes } : {}) });
  writeFileSync(join(pub, 'fonts', f.out), buf);
  fontTotal += buf.length;
  console.log(`${f.file} ${kb(statSync(input).size)} -> ${f.out} ${kb(buf.length)}`);
}
console.log(`fonts total ${kb(fontTotal)}`);
