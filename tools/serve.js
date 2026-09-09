#!/usr/bin/env node
/**
 * Zero-dependency static server for local dev. Serves the repo root so both
 * /src/index.html (the game) and /tests/headless.html (the harness) work,
 * and so the ES module imports across those two trees resolve.
 *
 *   npm run dev            -> http://127.0.0.1:8778/src/index.html
 *   npm run dev -- 9000    -> same, on port 9000
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.argv[2]) || 8778;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel === '/') rel = '/src/index.html';
    const path = resolve(ROOT, '.' + rel);
    // Refuse anything that escapes the repo root.
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      // Always revalidate: stale modules during tuning are maddening.
      'cache-control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`  game    http://127.0.0.1:${PORT}/src/index.html`);
  console.log(`  tests   http://127.0.0.1:${PORT}/tests/headless.html`);
  console.log(`  (npm test runs the same assertions in node, much faster)`);
});
