#!/usr/bin/env node
// Serves the spike page on the local network, cross-origin isolated (#1060): with COOP/COEP the
// page gets WebAssembly threads and can measure its memory. Copyright 2026 Pedro Maló, AGPL-3.0-only.
//   node research/ink-models/serve.mjs [port]      (default 8790)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8790);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // credentialless, not require-corp: the CDN and the Hub are fetched without credentials.
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ink models spike: http://localhost:${PORT}/`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`  on the network: http://${n.address}:${PORT}/`);
  }
});
