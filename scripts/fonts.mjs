// Pins Fredoka's weight axis (600 bold, 400 thin) into static TrueType fonts for Render/TtfFont.cs, and copies Noto Sans:
import fs from 'fs';
import subsetFont from 'subset-font';
const src = fs.readFileSync('assets-src/fonts/Fredoka.ttf');
let chars = '';
for (let c = 0x20; c < 0x250; c++) chars += String.fromCodePoint(c);
chars += '’‘“”…–— •€';
for (const [name, wght] of [['Fredoka-600', 600], ['Fredoka-400', 400]]) {
  const out = await subsetFont(src, chars, { targetFormat: 'truetype', variationAxes: { wght } });
  fs.writeFileSync(`Assets/Resources/Fonts/${name}.bytes`, out);
  console.log(name, out.length);
}
fs.copyFileSync('assets-src/fonts/NotoSans-Regular.ttf', 'Assets/Resources/Fonts/NotoSans-Regular.bytes');
fs.copyFileSync('assets-src/fonts/NotoSans-Bold.ttf', 'Assets/Resources/Fonts/NotoSans-Bold.bytes');
