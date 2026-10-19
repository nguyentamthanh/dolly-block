// Drives the game in headless Chrome: node scripts/play.mjs <level> [outPrefix]
// Loads a level, drags every tray piece onto its solution cell, and saves screenshots along the way.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const level = process.argv[2] ?? '0';
const prefix = process.argv[3] ?? 'tests/out/play';
mkdirSync('tests/out', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[page ${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));
await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
await page.goto(`http://localhost:5180/?scene=game&level=${level}&tut=1&gems=47`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const g = window.__game;
  const s = g.scene.getScene('Game');
  const rs = s.cameras.main.zoom;
  const out = [];
  for (let i = 0; i < s.inTray.length; i++) {
    const pv = s.inTray[i];
    if (!pv) continue;
    const d = pv.piece.duplicatePiece();
    const origin = d.orientToSolution();
    out.push({ i, id: pv.piece.id, rotNeeded: d.rot, rotNow: pv.piece.rot, origin, bbox: d.bbox() });
  }
  return { rs, n: s.inTray.length, pieces: out, cs: s.board.cellSize };
});
console.log('pieces', JSON.stringify(info.pieces.map((p) => [p.id, p.rotNeeded, p.origin.x, p.origin.y])));

for (const p of info.pieces) {
  // rotate by tapping until the orientation matches
  for (let k = 0; k < p.rotNeeded; k++) {
    const pos = await page.evaluate((idx) => {
      const s = window.__game.scene.getScene('Game');
      const pv = s.inTray[idx];
      const r = s.tray.slotRect(pv.trayIndex);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }, p.i);
    await page.mouse.click(pos.x, pos.y);
    await new Promise((r) => setTimeout(r, 400));
  }
  const pts = await page.evaluate((idx) => {
    const s = window.__game.scene.getScene('Game');
    const pv = s.inTray[idx];
    const r = s.tray.slotRect(pv.trayIndex);
    const d = pv.piece.duplicatePiece();
    const origin = d.orientToSolution();
    const cs = s.board.cellSize;
    const c0 = d.localCells()[0];
    // grab the first cell centre while it is in the tray, drop so that the same cell centre lands on its target cell
    const fromX = pv.left + (c0.x + 0.5) * pv.cellSize;
    const fromY = pv.top + (c0.y + 0.5) * pv.cellSize;
    const toX = s.board.x + s.board.originX + (origin.x + c0.x + 0.5) * cs;
    const toY = s.board.y + s.board.originY + (origin.y + c0.y + 0.5) * cs;
    return { fromX, fromY, toX, toY, slotX: r.x + r.w / 2, slotY: r.y + r.h / 2 };
  }, p.i);
  await page.mouse.move(pts.fromX, pts.fromY);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(pts.fromX + ((pts.toX - pts.fromX) * k) / 8, pts.fromY + ((pts.toY - pts.fromY) * k) / 8);
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 450));
}
const state = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  return { solved: s.state.isSolved(), empty: s.state.emptyCount(), accepting: s.acceptingInput, run: JSON.stringify(window.localStorage.getItem('cozy-blocks/progress')).slice(0, 120) };
});
console.log('state', JSON.stringify(state));
await page.screenshot({ path: `${prefix}_placed.png` });
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: `${prefix}_win1.png` });
await new Promise((r) => setTimeout(r, 2200));
await page.screenshot({ path: `${prefix}_win2.png` });
await browser.close();
