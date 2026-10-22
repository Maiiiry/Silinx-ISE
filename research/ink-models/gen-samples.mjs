#!/usr/bin/env node
// Draws the 10 sample drawings of samples.json into samples/*.png (#1060). Copyright 2026 Pedro Maló,
// AGPL-3.0-only. They imitate a teacher's pen on a board: two handwriting fonts (Caveat and Kalam,
// SIL Open Font Licence, from Google Fonts) with every character turned, moved and sized a little
// at random, and wobbly lines for the gates, wires and table rules. A fixed seed makes them the
// same every run. Real drawings made on the board (the page's Save PNG) can replace them.
//   node research/ink-models/gen-samples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(fs.readFileSync(path.join(DIR, 'samples.json'), 'utf8'));

function drawAll(samples) {
  let seed = 20261022;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const jit = a => (rnd() * 2 - 1) * a;
  const INK = '#151515';

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = g.fillStyle = INK;
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 4;
    return [c, g];
  }
  // A curve f(t), t in [0, 1], drawn with a slow wobble across it, as a hand does.
  function stroke(g, f, n = 40) {
    const p1 = rnd() * 6.3, p2 = rnd() * 6.3, a = 1.2 + rnd();
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n, [x, y] = f(t);
      const [x2, y2] = f(Math.min(1, t + 1e-3)), [x1, y1] = f(Math.max(0, t - 1e-3));
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      const o = a * (Math.sin(t * 5 + p1) + 0.5 * Math.sin(t * 13 + p2));
      i ? g.lineTo(x + nx * o, y + ny * o) : g.moveTo(x + nx * o, y + ny * o);
    }
    g.stroke();
  }
  const line = (g, x0, y0, x1, y1) => stroke(g, t => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  const arc = (g, cx, cy, r, a0, a1) => stroke(g, t => [cx + r * Math.cos(a0 + (a1 - a0) * t), cy + r * Math.sin(a0 + (a1 - a0) * t)]);
  const quad = (g, [x0, y0], [cx, cy], [x1, y1]) =>
    stroke(g, t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1]);

  // Text, one character at a time; returns the x after it.
  function write(g, s, x, y, size, font) {
    for (const ch of s) {
      const sz = size * (1 + jit(0.07));
      if (ch === ' ') { x += size * 0.32; continue; }
      if (ch === '·') { g.beginPath(); g.arc(x + size * 0.14, y - size * 0.28 + jit(2), 4, 0, 7); g.fill(); x += size * 0.3; continue; }
      if (ch === '⊕') {
        const r = size * 0.3, cx = x + r + 4, cy = y - size * 0.28;
        arc(g, cx, cy, r, 0, 6.4); line(g, cx - r, cy, cx + r, cy); line(g, cx, cy - r, cx, cy + r);
        x += 2 * r + 12; continue;
      }
      g.save();
      g.font = `${sz}px ${font}`;
      g.translate(x, y + jit(3));
      g.rotate(jit(0.07));
      g.fillText(ch, 0, 0);
      g.restore();
      g.font = `${size}px ${font}`;
      x += g.measureText(ch).width * (1 + jit(0.08)) + 1;
    }
    return x;
  }

  function andGate(g, x, y) { // left edge at x, centre y, 120 tall
    line(g, x, y - 60, x, y + 60); line(g, x, y - 60, x + 50, y - 60); line(g, x, y + 60, x + 50, y + 60);
    arc(g, x + 50, y, 60, -Math.PI / 2, Math.PI / 2);
    return [x + 110, y];
  }
  function orGate(g, x, y) {
    quad(g, [x, y - 60], [x + 35, y], [x, y + 60]);
    quad(g, [x, y - 60], [x + 85, y - 60], [x + 130, y]);
    quad(g, [x, y + 60], [x + 85, y + 60], [x + 130, y]);
    return [x + 130, y];
  }

  const out = {};
  for (const [i, s] of samples.entries()) {
    const font = i % 2 ? 'Kalam' : 'Caveat', size = i % 2 ? 64 : 84;
    let c, g;
    if (s.kind === 'expression') {
      [c, g] = canvas(900, 200);
      g.font = `${size}px ${font}`;
      write(g, s.text, 30, 130, size, font);
    } else if (s.kind === 'table') {
      const cols = s.header.length, cw = 90, rh = 64;
      [c, g] = canvas(cols * cw + 80, (s.rows.length + 1) * rh + 70);
      const x0 = 50, y0 = 70;
      s.header.forEach((h, j) => write(g, h, x0 + j * cw + (j === cols - 1 ? 24 : 0), y0, size * 0.85, font));
      s.rows.forEach((r, k) => r.forEach((v, j) => write(g, String(v), x0 + j * cw + (j === cols - 1 ? 24 : 0), y0 + (k + 1) * rh, size * 0.8, font)));
      line(g, 30, y0 + 20, cols * cw + 50, y0 + 22);
      const xv = x0 + (cols - 1) * cw - 8;
      line(g, xv, 20, xv + 2, c.height - 20);
    } else if (s.id === 's1') {
      [c, g] = canvas(760, 420);
      const [ox, oy] = andGate(g, 360, 210);
      line(g, 210, 180, 360, 180); line(g, 210, 240, 360, 240); line(g, ox, oy, 620, oy);
      write(g, 'A', 125, 200, size, font); write(g, 'B', 125, 262, size, font); write(g, 'F', 640, oy + 22, size, font);
    } else {
      [c, g] = canvas(940, 460);
      const [ax, ay] = andGate(g, 290, 170);
      line(g, 150, 140, 290, 140); line(g, 150, 200, 290, 200);
      quad(g, [ax, ay], [470, ay], [500, 210]); line(g, 500, 210, 548, 210);
      line(g, 150, 290, 548, 290);
      const [fx, fy] = orGate(g, 530, 250);
      line(g, fx, fy, 820, fy);
      write(g, 'A', 100, 160, size, font); write(g, 'B', 100, 222, size, font); write(g, 'C', 100, 312, size, font);
      write(g, 'F', 836, fy + 22, size, font);
    }
    out[s.id] = c.toDataURL('image/png');
  }
  return out;
}

const browser = await chromium.launch({ channel: process.env.SPIKE_CHANNEL ?? 'chrome' }); // the installed Chrome
const page = await browser.newPage();
await page.setContent('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat&family=Kalam&display=block">');
await page.evaluate(async () => { await document.fonts.load('84px Caveat'); await document.fonts.load('64px Kalam'); });
const pngs = await page.evaluate(drawAll, samples);
await browser.close();
for (const [id, url] of Object.entries(pngs)) {
  fs.writeFileSync(path.join(DIR, 'samples', `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`samples/${id}.png`);
}
