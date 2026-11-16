// Regression test of the engine-free C# code (unity/Tests/Parity: Core + audio synths, plain .NET, no Unity licence):
// dumps the first 150 levels, RNG draws, hashes, every sound effect, the music and all texts, and compares a SHA-256 of
// each section with unity/Tests/Parity/golden.json. The golden values were taken while the C# output was bit-identical
// to the Phaser build (tag phaser-final), so a mismatch means a change in what players get.
//   npm test                 check
//   npm test -- --update     accept the current output as the new golden (after an intended change)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const proj = join(root, 'unity', 'Tests', 'Parity');
const goldenPath = join(proj, 'golden.json');
const LEVELS = 150;
const SFX = [
  'pickup', 'place', 'refuse', 'undo', 'hint_deny', 'hint_use', 'button_tap', 'star_pop', 'diamond_tick',
  'win_fanfare', 'tick', 'pop', 'sparkle', 'happy', 'upset', 'whoosh', 'focus', 'shutter', 'star_slam',
];

execFileSync('dotnet', ['build', proj, '-c', 'Release', '--nologo', '-v', 'q'], { stdio: 'inherit' });
const out = execFileSync('dotnet', ['run', '--project', proj, '-c', 'Release', '--no-build', '--', String(LEVELS), ...SFX], {
  maxBuffer: 256 * 1024 * 1024,
  encoding: 'utf8',
});
const dump = JSON.parse(out);

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sections = {
  version: sha(dump.version),
  rng: sha(dump.rng),
  hash: sha(dump.hash),
  music: sha(dump.music),
  texts: sha(dump.texts),
};
for (let i = 0; i < LEVELS; i++) sections[`level ${i}`] = sha(dump.levels[i]);
for (const name of SFX) sections[`sfx ${name}`] = sha(dump.sfx[name]);

if (process.argv.includes('--update') || !existsSync(goldenPath)) {
  writeFileSync(goldenPath, JSON.stringify(sections, null, 1) + '\n');
  console.log(`[unity_test] wrote ${Object.keys(sections).length} golden hashes to ${goldenPath}`);
  process.exit(0);
}

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
const bad = Object.keys({ ...golden, ...sections }).filter((k) => golden[k] !== sections[k]);
if (bad.length) {
  console.error(`[unity_test] FAIL: ${bad.length} section(s) changed: ${bad.slice(0, 20).join(', ')}${bad.length > 20 ? ', ...' : ''}`);
  console.error('If the change is intended, run: npm test -- --update');
  process.exit(1);
}
console.log(`[unity_test] ok: ${Object.keys(sections).length} sections match (${LEVELS} levels, ${SFX.length} sounds, music, RNG, texts)`);
