// Production build + Playgama upload zip:  npm run package:web   (VERSION env overrides package.json's version)
//
//   1. `npm run build` (typecheck + vite) into dist/
//   2. checks the size budget: the whole zip, and what a player downloads before the menu is playable
//   3. zips dist/ as cozy-blocks-<version>.zip (index.html at the zip root, as Playgama expects)
import AdmZip from 'adm-zip';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.VERSION || pkg.version;

// Budgets (bytes). The Godot build was ~13 MB over the wire.
const BUDGET_ZIP = 3 * 1024 * 1024;
const BUDGET_STARTUP = 1.6 * 1024 * 1024;

const fail = (msg) => {
  console.error(`[build_web] FAIL: ${msg}`);
  process.exit(1);
};
const log = (...a) => console.log('[build_web]', ...a);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

rmSync(dist, { recursive: true, force: true });
log('vite build ...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });
if (!existsSync(join(dist, 'index.html'))) fail('dist/index.html missing');

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const files = walk(dist);
const rel = (f) => relative(dist, f).replaceAll('\\', '/');
const size = (f) => statSync(f).size;
const wire = (f) => (/\.(js|css|html|json|svg)$/.test(f) ? gzipSync(readFileSync(f), { level: 9 }).length : size(f));

for (const need of ['playgama-bridge.js', 'playgama-bridge-config.json']) {
  if (!existsSync(join(dist, need))) fail(`${need} missing from dist/`);
}

// What a first-time player downloads before the menu shows: the page, the scripts, fonts, ONE menu painting,
// the Bridge (CDN copy normally; the local one counted as the worst case).
const startup = files.filter((f) => !/home_bg_(34|sq|wide)\.webp$/.test(f));
const startupBytes = startup.reduce((a, f) => a + wire(f), 0);
const totalBytes = files.reduce((a, f) => a + size(f), 0);

console.log('\nfile'.padEnd(46) + 'size'.padStart(12) + 'on the wire'.padStart(14));
for (const f of files.sort((a, b) => size(b) - size(a))) console.log(rel(f).padEnd(45) + kb(size(f)).padStart(12) + kb(wire(f)).padStart(14));
console.log(`\ndist total ${kb(totalBytes)} in ${files.length} files`);
console.log(`startup download (menu playable) ~ ${kb(startupBytes)} (budget ${kb(BUDGET_STARTUP)})`);

const zipName = `cozy-blocks-${version}.zip`;
const zipPath = join(root, zipName);
rmSync(zipPath, { force: true });
const zip = new AdmZip();
for (const f of files) {
  const r = rel(f);
  const dir = r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '';
  zip.addLocalFile(f, dir);
}
zip.writeZip(zipPath);
const zipBytes = size(zipPath);
console.log(`${zipName}: ${kb(zipBytes)} (budget ${kb(BUDGET_ZIP)})`);

if (startupBytes > BUDGET_STARTUP) fail(`startup download ${kb(startupBytes)} is over budget`);
if (zipBytes > BUDGET_ZIP) fail(`zip ${kb(zipBytes)} is over budget`);
log('ok');
