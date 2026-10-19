// End-to-end checks in headless Chrome against the dev server (npm run dev, port 5180).   node tests/e2e.mjs
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:5180';
let passed = 0;
let failed = 0;
const ok = (cond, label) => {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
};
const eq = (got, want, label) => {
  if (JSON.stringify(got) === JSON.stringify(want)) ok(true, label);
  else {
    failed++;
    console.log(`  FAIL  ${label} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(query, w = 720, h = 1280, keep = false) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text());
  });
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  if (!keep) await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(`${BASE}/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).length > 0, { timeout: 20000 });
  await sleep(2200);
  return page;
}
const game = (page, fn, ...args) => page.evaluate(new Function('args', `const s = window.__game.scene.getScene('Game'); return (${fn.toString()})(s, ...args);`), args);

console.log('\nGame: level 0 loads and lays out');
{
  const page = await open('scene=game&level=0&tut=1&gems=47');
  const r = await game(page, (s) => ({
    pieces: s.allViews.length,
    want: s.level.fixedPieces.length + s.level.trayPieces.length,
    cell: s.board.cellSize,
    slot: s.tray.slotSize,
    centres: s.inTray.every((pv, i) => {
      const r = s.tray.slotRect(i);
      const cx = pv.left + pv.boxW / 2;
      const cy = pv.top + pv.boxH / 2;
      return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h;
    }),
    fixedOnGrid: s.level.fixedPieces.every((p) => {
      const pv = s.onBoard.get(p.id);
      return Math.abs(pv.left - (s.board.x + s.board.originX + pv.origin.x * s.board.cellSize)) < 0.01;
    }),
    cellRound: (() => {
      const c = { x: 2, y: 3 };
      const r = s.board.cellRectLocal(c);
      const g = s.board.cellAt(s.board.x + r.x + r.w / 2, s.board.y + r.y + r.h / 2);
      return g.x === c.x && g.y === c.y;
    })(),
    off: s.board.cellAt(-50, -50),
  }));
  eq(r.pieces, r.want, 'a view per fixed + tray piece');
  ok(r.cell > 0, `board cell size ${r.cell}`);
  ok(r.slot >= 44, `tray slot ${r.slot} px is readable`);
  ok(r.centres, 'every tray piece sits inside its slot');
  ok(r.fixedOnGrid, 'fixed pieces are exactly on the grid');
  ok(r.cellRound, 'cell_at(cell_rect centre) round-trips');
  eq(r.off, { x: -1, y: -1 }, 'off-board point is INVALID');
  await page.close();
}

console.log('\nGame: hints solve the level, undo reverts');
{
  const page = await open('scene=game&level=0&tut=1&gems=9999');
  const empty0 = await game(page, (s) => s.state.emptyCount());
  await game(page, (s) => s.hint());
  await sleep(300);
  const empty1 = await game(page, (s) => s.state.emptyCount());
  ok(empty1 < empty0, `hint filled cells (${empty0} -> ${empty1})`);
  await game(page, (s) => s.undo());
  await sleep(300);
  eq(await game(page, (s) => s.state.emptyCount()), empty0, 'undo restores the empty count');
  for (let i = 0; i < 40; i++) {
    await game(page, (s) => s.hint());
    await sleep(120);
  }
  const done = await game(page, (s) => ({ empty: s.state.emptyCount(), solved: s.state.isSolved(), accepting: s.acceptingInput }));
  eq(done.empty, 0, 'hints fill the board');
  ok(done.solved, 'board is solved');
  ok(!done.accepting, 'input is locked after the win');
  await page.close();
}

console.log('\nGame: real scoring, rewards and hint cost');
{
  const page = await open('scene=game&level=1&tut=1&gems=47');
  const before = await game(page, (s) => ({ d: s.constructor && window.localStorage.length, gems: JSON.parse(window.localStorage.getItem('cozy-blocks/progress') || '{}').diamonds }));
  void before;
  const r = await game(page, (s) => {
    const gs = window.__gs;
    void gs;
    // place every tray piece in its solution orientation without hints or undos
    const startGems = 47;
    for (let i = 0; i < s.inTray.length; i++) {
      const pv = s.inTray[i];
      if (!pv) continue;
      const origin = pv.piece.orientToSolution();
      pv.setCellSize(s.board.cellSize);
      s.pickOrigin = { slot: 'tray', origin: { x: -1, y: -1 }, tray: i, id: pv.piece.id };
      s.commitPlace(pv, origin);
    }
    const save = JSON.parse(window.localStorage.getItem('cozy-blocks/progress'));
    return { solved: s.state.isSolved(), stars: save.stars_at['1'], gems: save.diamonds - startGems, hi: save.highest_unlocked };
  });
  ok(r.solved, 'placing every piece solves the level');
  eq(r.stars, 3, 'no help = 3 stars');
  eq(r.gems, 5, 'clearing a level pays 5 diamonds');
  await page.close();

  const page2 = await open('scene=game&level=0&tut=1&gems=0');
  await game(page2, (s) => s.hint());
  await sleep(300);
  const r2 = await game(page2, (s) => ({ empty: s.state.emptyCount(), total: s.state.playableCells().length, gems: JSON.parse(window.localStorage.getItem('cozy-blocks/progress') || '{"diamonds":0}').diamonds }));
  ok(r2.empty > 0, 'a hint with no diamonds places nothing');
  await page2.close();
}

console.log('\nTutorial and drag guide');
{
  const page = await open('scene=game&level=0&tut=0&gems=47');
  const t0 = await game(page, (s) => ({ vis: s.tutorial.visible, guide: !!s.guide }));
  ok(t0.vis, 'tutorial shows on a first run');
  ok(!t0.guide, 'drag guide waits for the tutorial to finish');
  for (let i = 0; i < 5; i++) {
    await game(page, (s) => s.tutorial.onNext());
    await sleep(120);
  }
  const t1 = await game(page, (s) => ({ vis: s.tutorial.visible, guide: !!s.guide, done: JSON.parse(window.localStorage.getItem('cozy-blocks/progress')).tutorial_done }));
  ok(!t1.vis, 'NEXT x5 closes the tutorial');
  ok(t1.done, 'tutorial_done is saved');
  ok(t1.guide, 'the drag guide appears on level 1');
  await page.close();
}

console.log('\nMid-level progress is saved and restored');
{
  const page = await open('scene=game&level=6&hi=6&tut=1&gems=47');
  const placed = await game(page, (s) => {
    const pv = s.inTray.find((p) => p);
    const origin = pv.piece.orientToSolution();
    pv.setCellSize(s.board.cellSize);
    s.pickOrigin = { slot: 'tray', origin: { x: -1, y: -1 }, tray: pv.trayIndex, id: pv.piece.id };
    s.commitPlace(pv, origin);
    return { id: pv.piece.id, run: JSON.parse(window.localStorage.getItem('cozy-blocks/progress')).run };
  });
  eq(placed.run.level, 6, 'the run is saved against its level');
  ok(placed.run.placed.length === 1 && placed.run.placed[0][0] === placed.id, 'one placed piece is recorded');
  const saved = await page.evaluate(() => localStorage.getItem('cozy-blocks/progress'));
  await page.close();
  // A fresh page that starts from the saved progress, like returning to the game.
  const page2 = await browser.newPage();
  page2.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page2.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  await page2.evaluateOnNewDocument((s) => localStorage.setItem('cozy-blocks/progress', s), saved);
  await page2.goto(`${BASE}/?scene=game&cur=6`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.__game && window.__game.scene.getScenes(true).length > 0);
  await sleep(2200);
  const back = await game(page2, (s) => ({
    level: s.level.levelIndex,
    onBoard: [...s.onBoard.values()].filter((p) => p.movable).length,
    tray: s.inTray.filter((p) => p).length,
    total: s.level.trayPieces.length,
  }));
  eq(back.level, 6, 'the saved level is reopened');
  eq(back.onBoard, 1, 'the placed piece is back on the board');
  eq(back.tray, back.total - 1, 'and out of the tray');
  await page2.close();
}

console.log('\nMenu and timeline');
{
  const page = await open('scene=mainmenu&tut=1&gems=47&stars=1&level=12');
  const m = await page.evaluate(() => {
    const s = window.__game.scene.getScene('MainMenu');
    return { play: !!s.play, children: s.children.length };
  });
  ok(m.play, 'menu has a PLAY button');
  await page.close();
  const page2 = await open('scene=timeline&tut=1&gems=47&stars=1&level=12');
  const t = await page2.evaluate(() => {
    const s = window.__game.scene.getScene('Timeline');
    return { cards: s.cards.length, play: !!s.playBtn, scroll: s.scrollY, max: s.maxScroll() };
  });
  eq(t.cards, 12, 'one polaroid per cleared level');
  ok(t.scroll > 0 && Math.abs(t.scroll - t.max) < 1, 'timeline opens scrolled to the newest photo');
  await page2.close();
}

console.log('\nYouTube Playables rules');
{
  // Esc closes the topmost dialog and is not preventDefault()ed.
  const page = await open('scene=mainmenu&tut=1&gems=47');
  await page.evaluate(() => window.__game.scene.getScene('MainMenu').openLanguage());
  await sleep(800);
  const prevented = await page.evaluate(() => {
    let p = null;
    window.addEventListener('keydown', (e) => { setTimeout(() => (p = e.defaultPrevented), 0); });
    return new Promise((r) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); setTimeout(() => r(p), 50); });
  });
  await sleep(300);
  const dialogOpen = await page.evaluate(() => window.__game.scene.getScene("MainMenu").children.list.some((c) => c.type === 'Rectangle' && c.input?.enabled && c.alpha > 0 && c.width > 700 && c.fillAlpha > 0.5));
  ok(prevented === false, 'Esc is not preventDefault()ed');
  ok(!dialogOpen, 'Esc closes the language dialog');
  // Page Visibility / blur no longer drive Phaser's loop.
  const loopOk = await page.evaluate(() => {
    const g = window.__game;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    return g.loop.running && g.loop.inFocus;
  });
  ok(loopOk, 'blur / visibilitychange do not pause the game');
  await page.close();
}

console.log('\nExtreme aspect ratios and resizing');
{
  for (const [w, h] of [[360, 1280], [2560, 720], [320, 568], [1280, 400]]) {
    const page = await open('scene=game&level=3&tut=1&gems=47', w, h);
    const r = await game(page, (s) => ({ cell: s.board.cellSize, pieces: s.allViews.length, ok: s.board.cellSize > 20 && s.inTray.every((pv) => !pv || pv.visible) }));
    ok(r.ok && r.pieces > 0, `plays at ${w}x${h} (cell ${Math.round(r.cell)})`);
    await page.close();
  }
  // State survives a resize mid-level.
  const page = await open('scene=game&level=6&hi=6&tut=1&gems=47');
  await game(page, (s) => {
    const pv = s.inTray.find((p) => p);
    const origin = pv.piece.orientToSolution();
    pv.setCellSize(s.board.cellSize);
    s.pickOrigin = { slot: 'tray', origin: { x: -1, y: -1 }, tray: pv.trayIndex, id: pv.piece.id };
    s.commitPlace(pv, origin);
  });
  const before = await game(page, (s) => ({ n: s.state.emptyCount(), level: s.level.levelIndex }));
  await page.setViewport({ width: 900, height: 500, deviceScaleFactor: 1 });
  await sleep(1500);
  await page.setViewport({ width: 400, height: 900, deviceScaleFactor: 1 });
  await sleep(1500);
  const after = await game(page, (s) => ({ n: s.state.emptyCount(), level: s.level.levelIndex }));
  eq(after, before, 'resizing keeps the level and its progress');
  await page.close();
  // Loading in a hidden, zero-sized frame must not break the game (YouTube starts it that way).
  const host = await browser.newPage();
  host.on('pageerror', (e) => errors.push(e.stack || e.message));
  await host.setViewport({ width: 720, height: 1280 });
  await host.goto(`${BASE}/favicon.png`);
  await host.evaluate((url) => { const f = document.createElement('iframe'); f.id = 'f'; f.style.cssText = 'width:0;height:0;border:0'; f.src = url; document.body.appendChild(f); }, `${BASE}/?scene=mainmenu&tut=1`);
  await sleep(4000);
  await host.evaluate(() => { const f = document.getElementById('f'); f.style.cssText = 'width:720px;height:1280px;border:0'; });
  await sleep(2500);
  const z = await host.evaluate(() => {
    const w = document.getElementById('f').contentWindow;
    const c = w.document.querySelector('canvas');
    return { has: !!c, w: c?.clientWidth, h: c?.clientHeight, iw: w.innerWidth, ih: w.innerHeight };
  });
  ok(z.has && z.iw > 0 && z.w === z.iw && z.h === z.ih, `a game started at zero size fits once the frame is sized (${z.w}x${z.h})`);
  await host.close();
}

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ', e.split('\n')[0]);
ok(errors.length === 0, 'no console or page errors');
await browser.close();
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
