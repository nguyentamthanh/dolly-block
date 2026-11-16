// Tiny static server for the WebGL build: node scripts/serve_web.mjs [port=5182] [dir=Builds/WebGL]
// The build is gzip with a JS decompression fallback, so plain files with no Content-Encoding work.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.unityweb': 'application/octet-stream',
};

/** Starts the server; resolves with it once listening. */
export function serveWeb(port = 5182, dir = join(root, 'Builds', 'WebGL')) {
  const base = resolve(dir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(base, path));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 5182);
  const dir = process.argv[3] ? resolve(process.argv[3]) : undefined;
  await serveWeb(port, dir);
  console.log(`serving ${dir || 'Builds/WebGL'} on http://localhost:${port}`);
}
