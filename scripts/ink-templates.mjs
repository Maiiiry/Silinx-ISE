// Makes core/ink/templates.json, the built-in templates of the handwriting recognizer (#1056), from the skeleton
// font (core/ink/font.js): each variant of each symbol as drawn (the skeleton) and twice as a hand writes it, mildly
// (core/ink/synth.js, fixed seeds: the same file every time). test/ink.test.js checks that the file is up to date.
//
//   node scripts/ink-templates.mjs           (writes the file)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPHS, SYMBOLS } from '../core/ink/font.js';
import { handGlyph, rng } from '../core/ink/synth.js';
import { encodeSample } from '../core/ink/templates.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES_FILE = path.join(ROOT, 'core', 'ink', 'templates.json');

// fewer points: those a straight line through the others would miss by more than `tol` (Ramer-Douglas-Peucker)
function simplify(a, tol = 1) {
  const pts = [];
  for (let i = 0; i < a.length; i += 2) pts.push([a[i], a[i + 1]]);
  if (pts.length <= 2) return a;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const rdp = (i, j) => {
    const [x0, y0] = pts[i], [x1, y1] = pts[j], L = Math.hypot(x1 - x0, y1 - y0);
    let far = -1, dmax = tol;
    for (let k = i + 1; k < j; k++) {
      // (a closed stroke: the distance from its ends)
      const d = L < tol ? Math.hypot(pts[k][0] - x0, pts[k][1] - y0) : Math.abs((x1 - x0) * (y0 - pts[k][1]) - (x0 - pts[k][0]) * (y1 - y0)) / L;
      if (d > dmax) { dmax = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; rdp(i, far); rdp(far, j); }
  };
  rdp(0, pts.length - 1);
  return pts.filter((_, k) => keep[k]).flat();
}

function buildTemplates() {
  const rand = rng(7);
  const templates = [];
  for (const ch of SYMBOLS) {
    GLYPHS[ch].forEach((_, variant) => {
      for (const amount of [0, 0.5, 0.5]) {
        const t = encodeSample(ch, handGlyph(ch, { rand, amount, variant }));
        templates.push({ c: t.c, s: t.s.map(a => simplify(a)) });
      }
    });
  }
  return { version: 1, source: 'scripts/ink-templates.mjs from core/ink/font.js', templates };
}

export const templatesText = () => `{"version":1,"source":"scripts/ink-templates.mjs from core/ink/font.js","templates":[\n${buildTemplates().templates.map(t => JSON.stringify(t)).join(',\n')}\n]}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(TEMPLATES_FILE, templatesText());
  const n = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8')).templates.length;
  console.log(`${path.relative(ROOT, TEMPLATES_FILE)}: ${n} templates of ${SYMBOLS.length} symbols`);
}
