import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const g = JSON.parse(readFileSync('tests/fixtures/godot_text.json', 'utf8'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5180/?scene=gallery', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 1500));
const res = await page.evaluate(async (labels) => {
  const out = [];
  const c = document.createElement('canvas').getContext('2d');
  for (const l of labels) {
    if (l.variant === 'bold_outline') continue;
    const weight = l.variant === 'thin_nooutline' ? 400 : 600;
    c.font = `${weight} ${l.size}px Fredoka, "Noto Sans UI", sans-serif`;
    const full = (s) => c.measureText(s).width;
    const sumRound = (s) => [...s].reduce((a, ch) => a + Math.round(c.measureText(ch).width), 0);
    out.push({ size: l.size, variant: l.variant, godotLevel: l.w_level, godotPlay: l.w_play,
      levelFull: full('Level 41'), levelRound: Math.round(full('Level 41')), levelSumRound: sumRound('Level 41'),
      playFull: full('PLAY'), playSumRound: sumRound('PLAY') });
  }
  return out;
}, g.labels);
for (const r of res) console.log(r.size, r.variant.padEnd(15), 'L god', r.godotLevel, 'full', r.levelFull.toFixed(2), 'sumR', r.levelSumRound, '| P god', r.godotPlay, 'full', r.playFull.toFixed(2), 'sumR', r.playSumRound);
await browser.close();
