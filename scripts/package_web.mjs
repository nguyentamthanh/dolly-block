// Zips the WebGL build for Playgama / YouTube Playables / CrazyGames uploads:
//   npm run build:web && npm run package:web
// Writes cozy-blocks-<version>.zip (index.html at the zip root). VERSION env overrides package.json's version.
import AdmZip from 'adm-zip';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const build = join(root, 'Builds', 'WebGL');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.VERSION || pkg.version;

for (const need of ['index.html', 'playgama-bridge.js', 'playgama-bridge-config.json', 'Build']) {
  if (!existsSync(join(build, need))) {
    console.error(`[package_web] missing ${join(build, need)}: run npm run build:web`);
    process.exit(1);
  }
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const zip = new AdmZip();
let total = 0;
for (const file of walk(build)) {
  const rel = relative(build, file).replace(/\\/g, '/');
  zip.addFile(rel, readFileSync(file));
  total += statSync(file).size;
}
const name = `cozy-blocks-${version}.zip`;
zip.writeZip(join(root, name));
console.log(`[package_web] ${name}: ${(statSync(join(root, name)).size / 1024 / 1024).toFixed(2)} MB (files ${(total / 1024 / 1024).toFixed(2)} MB)`);
