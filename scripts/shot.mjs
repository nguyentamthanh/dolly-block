// Screenshot helper: node scripts/shot.mjs <url> <out.png> [width=450] [height=800] [waitMs=1500] [dpr=1]
// Uses the system Chrome through puppeteer-core (no browser download).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [url, out, w = '450', h = '800', wait = '1500', dpr = '1'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [dpr]');
  process.exit(2);
}

mkdirSync(dirname(out), { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') console.log(`[page ${t}]`, m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.stack || e.message));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url()); });
  await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: Number(dpr) });
  await page.goto(url, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, Number(wait)));
  await page.screenshot({ path: out });
  console.log('saved', out);
} finally {
  await browser.close();
}
