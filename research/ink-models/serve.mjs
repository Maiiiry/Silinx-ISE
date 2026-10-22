#!/usr/bin/env node
// Serves the spike page on the local network, cross-origin isolated (#1060): with COOP/COEP the
// page gets WebAssembly threads and can measure its memory. Copyright 2026 Pedro Maló, AGPL-3.0-only.
//   node research/ink-models/serve.mjs [port] [--https]      (default 8790)
// --https, for the iPad (Safari has no flag to treat a plain-HTTP address as secure, and WebGPU and
// the threads need a secure page): a certificate authority of its own, made once with openssl in
// ~/.silinx/ink-models-tls (never in the repository) and limited to private addresses and localhost,
// signs a server certificate for this machine's addresses at every start. The iPad installs and
// trusts the authority once: https://<address>:<port>/spike-ca.cer.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const TLS = args.includes('--https');
const PORT = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8790);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown' };
const TLS_DIR = path.join(os.homedir(), '.silinx', 'ink-models-tls');

const addresses = () => Object.values(os.networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal).map(n => n.address);

function certificates() {
  fs.mkdirSync(TLS_DIR, { recursive: true, mode: 0o700 });
  const f = name => path.join(TLS_DIR, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (!fs.existsSync(f('ca.key'))) {
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-keyout', f('ca.key'), '-out', f('ca.cer'),
      '-subj', '/CN=Silinx ink-models spike (local)',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'nameConstraints=critical,permitted;DNS:localhost,permitted;IP:127.0.0.0/255.0.0.0,permitted;IP:10.0.0.0/255.0.0.0,'
        + 'permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:192.168.0.0/255.255.0.0');
    fs.chmodSync(f('ca.key'), 0o600);
  }
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...addresses().map(a => `IP:${a}`)].join(',');
  fs.writeFileSync(f('server.ext'), `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('server.key'), '-out', f('server.csr'), '-subj', '/CN=localhost');
  openssl('x509', '-req', '-sha256', '-days', '397', '-in', f('server.csr'), '-CA', f('ca.cer'), '-CAkey', f('ca.key'), '-CAcreateserial',
    '-out', f('server.cer'), '-extfile', f('server.ext'));
  return { key: fs.readFileSync(f('server.key')), cert: fs.readFileSync(f('server.cer')), ca: f('ca.cer') };
}

const tls = TLS ? certificates() : null;

function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (tls && url.pathname === '/spike-ca.cer') {
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="spike-ca.cer"' });
    fs.createReadStream(tls.ca).pipe(res);
    return;
  }
  const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // require-corp: Safari has no credentialless; the CDN and the Hub answer CORS requests.
    'Cross-Origin-Embedder-Policy': process.env.SPIKE_COEP || 'require-corp',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

const server = tls ? https.createServer({ key: tls.key, cert: tls.cert }, handle) : http.createServer(handle);
const scheme = tls ? 'https' : 'http';
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ink models spike: ${scheme}://localhost:${PORT}/`);
  for (const a of addresses()) console.log(`  on the network: ${scheme}://${a}:${PORT}/`);
  if (tls) console.log(`  the certificate authority to install on the iPad: ${scheme}://<address above>:${PORT}/spike-ca.cer`);
});
