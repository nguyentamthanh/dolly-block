// Screenshots of the overlay panels: node scripts/panels.mjs [lang]
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const lang = process.argv[2] ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function open(q) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(`http://localhost:5180/?${q}${lang ? `&lang=${lang}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).length > 0);
  await sleep(2500);
  return page;
}
const sfx = lang ? `_${lang}` : '';
let page = await open('scene=mainmenu&tut=1&gems=47');
await page.evaluate(() => window.__game.scene.getScene('MainMenu').openLanguage());
await sleep(1200);
await page.screenshot({ path: `tests/out/panel_lang${sfx}.png` });
await page.close();

page = await open('scene=timeline&tut=1&gems=3&stars=1&level=12');
await page.evaluate(() => window.__game.scene.getScene('Timeline').openMenu());
await sleep(1200);
await page.screenshot({ path: `tests/out/panel_menu${sfx}.png` });
await page.evaluate(() => { const s = window.__game.scene.getScene('Timeline'); s.closeOverlay(); s.openGift(); });
await sleep(1200);
await page.screenshot({ path: `tests/out/panel_gift${sfx}.png` });
await page.close();

page = await open('scene=game&level=2&tut=1&gems=0');
await page.evaluate(() => window.__game.scene.getScene('Game').hint());
await sleep(1200);
await page.screenshot({ path: `tests/out/panel_ad${sfx}.png` });
await page.evaluate(() => { const g = window.__game.scene.getScene('Game'); g.adPanel.hide(); g.tutorial.showTutorial(); });
await sleep(1000);
await page.screenshot({ path: `tests/out/panel_tut${sfx}.png` });
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.__game.scene.getScene('Game').tutorial.onNext());
  await sleep(700);
  await page.screenshot({ path: `tests/out/panel_tut${i + 2}${sfx}.png` });
}
await page.close();
await browser.close();
console.log('done');
