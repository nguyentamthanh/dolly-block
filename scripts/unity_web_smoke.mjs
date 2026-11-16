// Smoke test of the WebGL build in headless Chrome, on a phone-sized touch screen (390x844 at 3x):
//   sh scripts/unity_build.sh WebGL && npm run smoke:web [outDir=tests/out/web]
// Checks: the page boots with the Bridge (mock platform locally), frame rate, a tap on PLAY opens level 1, a touch drag
// solves it, the win is saved through bridge.storage (the mock keeps it in localStorage "progress"), the saved run
// survives a reload, and a hidden page freezes the game. Exits 1 on the first failed check; screenshots go to outDir.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serveWeb } from './serve_web.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const outDir = resolve(process.argv[2] || join(root, 'tests', 'out', 'web'));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 5183;
const URL_ = `http://localhost:${PORT}/`;
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};

const server = await serveWeb(PORT);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // Tutorial already seen, so level 1 opens straight onto the board.
  await page.evaluateOnNewDocument(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('progress', '{"tutorial_done":true,"diamonds":20}');
    }
  });
  const boot = async () => {
    const t0 = Date.now();
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForFunction(() => window.unityInstance, { timeout: 60000 });
    await sleep(2500);
    return Date.now() - t0;
  };
  const fps = () =>
    page.evaluate(async () => {
      const t0 = performance.now();
      let n = 0;
      await new Promise((r) => {
        const f = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r());
        requestAnimationFrame(f);
      });
      return n / 2;
    });
  const frozen = async () => {
    const a = await page.screenshot({ encoding: 'base64' });
    await sleep(700);
    return a === (await page.screenshot({ encoding: 'base64' }));
  };
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('progress') || '{}'));

  const ms = await boot();
  console.log(`booted in ${ms} ms`);
  check(await page.evaluate(() => Boolean(window.bridge && window.bridge.platform && window.bridge.platform.id)), 'Bridge initialised');
  const menuFps = await fps();
  check(menuFps >= 30, `menu runs at ${menuFps} fps`);
  check(!(await frozen()), 'menu animates');
  await page.screenshot({ path: join(outDir, 'menu.png') });

  // PLAY (a quick tap: down and up within one frame must still count).
  await page.touchscreen.tap(195, 700);
  await sleep(3000);
  await page.screenshot({ path: join(outDir, 'level1.png') });

  // Level 1: drag the single tray piece into the gap (lifted above the finger while dragging).
  await page.touchscreen.touchStart(195, 790);
  await sleep(80);
  for (let i = 1; i <= 20; i++) {
    await page.touchscreen.touchMove(195 + (272 - 195) * (i / 20), 790 + (633 - 790) * (i / 20));
    await sleep(25);
  }
  await page.touchscreen.touchEnd();
  await sleep(3500);
  await page.screenshot({ path: join(outDir, 'win.png') });
  const afterWin = await saved();
  check(afterWin.highest_unlocked >= 1, `level 1 solved and saved (highest_unlocked ${afterWin.highest_unlocked})`);

  // Hidden page: frozen; visible again: running.
  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await sleep(300);
  check(await frozen(), 'hidden page freezes the game');
  await setHidden(false);
  await sleep(300);

  // Reload: the progress comes back from bridge.storage.
  await boot();
  await page.screenshot({ path: join(outDir, 'reloaded.png') });
  const reloaded = await saved();
  check(reloaded.highest_unlocked === afterWin.highest_unlocked, 'progress survives a reload');
  check(await page.evaluate(() => document.getElementById('status')?.style.display !== 'flex'), 'no start-up error notice');
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`screenshots in ${outDir}`);
process.exit(failed ? 1 : 0);
