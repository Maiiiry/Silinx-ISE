// The documentation against the codebase: what README.md and docs/*.md say must stay true when the
// code changes. Links and anchors resolve; the repository paths, npm scripts and menu items they name
// exist; and the facts about the Silinx toolchain (the default mode, its name, the boards it
// supports, the ones it does not) are those of server/toolchain.js, server/devices.js and
// server/open-flow.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../server/toolchain.js';
import { BOARDS } from '../server/devices.js';
import { openStatus } from '../server/open-flow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const noCode = t => t.replace(/```[\s\S]*?```/g, '');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e =>
  // (not the dot folders: .git, .cache, .claude's work trees of other checkouts…)
  e.name.startsWith('.') || ['node_modules', 'dist'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []);
const ALL_MD = walk('.');
// the user documentation (what the tests of facts read)
const DOCS = ['README.md', ...fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => `docs/${f}`)];

// GitHub's heading anchors
const slug = s => s.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
function anchors(file) {
  const seen = {};
  return new Set([...noCode(read(file)).matchAll(/^#{1,6} +(.+)$/gm)].map(m => {
    const s = slug(m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, ''));
    const n = seen[s] = (seen[s] ?? -1) + 1;
    return n ? `${s}-${n}` : s;
  }));
}

test('docs: every relative link and anchor of the Markdown files resolves', () => {
  const bad = [];
  let n = 0;
  for (const f of ALL_MD) {
    for (const [, url] of noCode(read(f)).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?|mailto):/.test(url)) continue;
      n++;
      const [p, a] = url.split('#');
      const target = p ? path.normalize(path.join(path.dirname(f), decodeURIComponent(p))) : f;
      if (!fs.existsSync(path.join(ROOT, target))) bad.push(`${f}: ${url} (no such file)`);
      else if (a && target.endsWith('.md') && !anchors(target).has(a)) bad.push(`${f}: ${url} (no such heading)`);
    }
  }
  assert.ok(n >= 10, `only ${n} links found`);
  assert.deepEqual(bad, []);
});

test('docs: the repository paths and npm scripts they name exist', () => {
  const bad = [];
  for (const f of DOCS) {
    for (const [, p] of read(f).matchAll(/`((?:bin|core|docker|docs|examples|research|scripts|server|test|web)\/[^`\s<>*~]+)`/g)) {
      const file = p.replace(/[:,].*$/, '');
      if (!fs.existsSync(path.join(ROOT, file))) bad.push(`${f}: ${file}`);
    }
  }
  const { scripts } = JSON.parse(read('package.json'));
  for (const f of ALL_MD) for (const [, s] of read(f).matchAll(/npm run ([\w:-]+)/g)) if (!scripts[s]) bad.push(`${f}: npm run ${s}`);
  assert.deepEqual(bad, []);
});

// the interface's labels: every string literal of web/js
const UI = fs.readdirSync(path.join(ROOT, 'web/js')).filter(f => f.endsWith('.js'))
  .flatMap(f => [...read(`web/js/${f}`).matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)/g)].map(m => (m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'")));
const MENUS = ['File', 'Edit', 'View', 'Project', 'Source', 'Process', 'Tools', 'Window', 'Help'];

test('docs: the menu paths they give (File ▸ …, Tools ▸ …) are the interface\'s', () => {
  const bad = [];
  let n = 0;
  for (const f of DOCS) {
    for (const [path_] of read(f).matchAll(new RegExp(`\\b(?:${MENUS.join('|')}) ▸ [^*.,;:)\\n]+`, 'g'))) {
      n++;
      for (const seg of path_.split(' ▸ ').map(s => s.replace(/[…(]+$/, '').trim())) {
        // 'Download / Open Project Bundle': two items
        const alts = /^(\w+) \/ (\w+) (.+)$/.exec(seg);
        const items = alts ? [`${alts[1]} ${alts[3]}`, `${alts[2]} ${alts[3]}`] : [seg];
        for (const it of items) if (!MENUS.includes(it) && !UI.some(s => s.startsWith(it))) bad.push(`${f}: "${it}" in ${path_}`);
      }
    }
  }
  assert.ok(n > 10, `only ${n} menu paths found`);
  assert.deepEqual(bad, []);
});

// ---- the Silinx toolchain
const MODE_LABEL = /\['silinx', '([^']+)'\]/.exec(read('web/js/wizards.js'))[1];
const boardsOf = pred => BOARDS.flatMap(b => (b.variants || [null]).map(v => {
  const short = b.name.replace(/^(Digilent|Xilinx|Numato) /, '').replace(/ \(.*\)$/, '');
  return { board: b.id, name: v ? `${short}-${v.id}` : short, device: v?.device || b.device };
})).filter(x => pred(openStatus(x.device).available));
const SUPPORTED = boardsOf(a => a);
// 'Basys2-100 / 250 and Nexys2-500 / 1200' → Basys2-100, Basys2-250, Nexys2-500, Nexys2-1200
const named = text => [...text.matchAll(/\b(Basys2|Nexys2|Nexys3|Atlys)-(\w+)((?: \/ \w+)*)/g)]
  .flatMap(([, b, v, more]) => [v, ...more.split(' / ').slice(1)].map(x => `${b}-${x}`));

test('docs: the Silinx toolchain\'s name and default mode are the code\'s', () => {
  assert.equal(MODE_LABEL, 'Silinx toolchain (experimental, no ISE)');
  for (const f of DOCS) assert.doesNotMatch(read(f), /Open toolchain \(experimental/, f);
  const readme = read('README.md');
  assert.ok(readme.includes(`*${MODE_LABEL}*`), 'README names the mode by its label');
  // "the default mode" exactly when it is
  const isDefault = DEFAULT_CONFIG.mode === 'silinx';
  for (const [f, says] of [['README.md', /\bthe default mode\b/], ['docs/GETTING-STARTED.md', /\bthe default mode\b/], ['docs/COMECAR.md', /\bo modo por omissão\b/]])
    assert.equal(says.test(read(f)), isDefault, `${f}: the Silinx toolchain is ${isDefault ? '' : 'not '}the default`);
});

test('docs: the boards the Silinx toolchain supports are the ones the code supports', () => {
  assert.ok(SUPPORTED.length >= 4, SUPPORTED.map(b => b.name).join(', '));
  const readme = read('README.md');
  // the quick start: no board claimed that is not supported, every supported Basys2 / Nexys2 named
  const bullet = /^- \*\*Synthesis and bitstreams need no Xilinx tool\*\*[\s\S]*?(?=^- |^#)/m.exec(readme)?.[0];
  assert.ok(bullet, 'README: the quick start says what needs no Xilinx tool');
  const quick = named(bullet);
  assert.deepEqual(quick.filter(n => !SUPPORTED.some(b => b.name === n)), [], 'claimed but not supported');
  assert.deepEqual(SUPPORTED.filter(b => /^(basys2|nexys2)$/.test(b.board) && !quick.includes(b.name)).map(b => b.name), [], 'supported but not named');
  // the section about the Silinx toolchain names every supported board, the Starter Kit too
  const section = /^\*\*Without ISE \(Silinx toolchain[\s\S]*?(?=^\*\*Recommended)/m.exec(readme)?.[0];
  assert.ok(section, 'README: the section on the Silinx toolchain');
  for (const b of SUPPORTED) {
    const ok = b.board === 's3e-starter' ? /Spartan-3E Starter Kit/.test(section) : named(section).includes(b.name);
    assert.ok(ok, `README's Silinx toolchain section does not name the ${b.name}`);
  }
  // "Basys2 and Nexys2 boards" (Getting Started, both languages): every variant of them
  for (const id of ['basys2', 'nexys2']) {
    const all = BOARDS.find(b => b.id === id).variants.length;
    assert.equal(SUPPORTED.filter(b => b.board === id).length, all, `every ${id} variant is supported`);
  }
  assert.match(read('docs/GETTING-STARTED.md'), /For the Basys2 and Nexys2 boards, nothing/);
  assert.match(read('docs/COMECAR.md'), /Para as placas Basys2 e Nexys2, nada/);
  // what it does not support yet is said so: the Spartan-6 boards
  const unsupported6 = boardsOf(a => !a).filter(b => ['nexys3', 'atlys'].includes(b.board));
  assert.equal(unsupported6.length, 2);
  assert.match(section, /does \*\*not yet support the Spartan-6 boards \(Nexys3, Atlys\)\*\*/);
});
