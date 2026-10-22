#!/usr/bin/env node
// The browser edition's app icons (#1051), web/icons/*.png, drawn from their SVG sources (silinx.svg: the
// logo with transparent corners; silinx-maskable.svg: full-bleed, the letter inside the safe zone that a
// launcher's mask keeps) by a headless Chrome. Run again after changing an SVG, and commit the PNGs:
//   node scripts/pwa-icons.mjs [path of Chrome]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../test/ui/harness.js';

const ICONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'icons');
const chrome = process.argv[2] || findChrome();
if (!chrome) { console.error('Google Chrome / Chromium not found: give its path'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-icons-'));
for (const [svg, png, size] of [['silinx.svg', 'silinx-192.png', 192], ['silinx.svg', 'silinx-512.png', 512], ['silinx-maskable.svg', 'silinx-maskable-512.png', 512]]) {
  const page = path.join(tmp, `${png}.html`);
  fs.writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${path.join(ICONS, svg)}" width="${size}" height="${size}" style="display:block"></body></html>`);
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${path.join(ICONS, png)}`, `file://${page}`], { stdio: 'ignore' });
  console.log(`web/icons/${png} (${size}×${size})`);
}
fs.rmSync(tmp, { recursive: true, force: true });
