// Builds dist/Silinx-ISE.html: the whole Project Navigator in one self-contained HTML file
// (no server). Projects live in the browser's localStorage; the examples are embedded.
//   node scripts/build-standalone.mjs [--site <dir>]
// --site also writes the GitHub Pages site (.github/workflows/pages.yml): the page as index.html and
// Silinx-ISE.html, and assets/ with what the Silinx toolchain fetches in the browser
// (web/js/open-flow-browser.js): the device descriptions (core/fpga/devices), the bit database
// (research/s3e-bitstream/db) and Yosys in WebAssembly (node_modules/@yowasp/yosys/gen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'Silinx-ISE.html');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- embedded examples
function readTree(dir, base = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, rel));
    else if (rel !== 'silinx.json') out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const examples = {};
for (const e of fs.readdirSync(path.join(ROOT, 'examples'), { withFileTypes: true })) {
  const dir = path.join(ROOT, 'examples', e.name);
  if (!e.isDirectory() || !fs.existsSync(path.join(dir, 'silinx.json'))) continue;
  examples[e.name] = { json: JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), files: readTree(dir) };
}

// ---- bundle the app with the local (server-less) API
const plugin = {
  name: 'silinx-standalone',
  setup(b) {
    b.onResolve({ filter: /^\/core\// }, a => ({ path: path.join(ROOT, a.path) }));
    b.onResolve({ filter: /^\.\/api\.js$/ }, a => (a.importer.includes(`${path.sep}web${path.sep}js${path.sep}`) ? { path: path.join(ROOT, 'web/js/api-local.js') } : undefined));
    b.onResolve({ filter: /^silinx-examples$/ }, () => ({ path: 'silinx-examples', namespace: 'virtual' }));
    b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({ contents: `export default ${JSON.stringify(examples)};`, loader: 'js' }));
  },
};
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/app.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning',
});
const appJs = res.outputFiles[0].text;
// the Silinx toolchain's Web Worker (web/js/open-flow-worker.js), embedded as text: the page starts
// it from a Blob (a single file has no other file to load it from)
const workerRes = await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/js/open-flow-worker.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', plugins: [plugin], logLevel: 'warning', platform: 'browser',
});
const workerJs = workerRes.outputFiles[0].text;

// ---- inline everything into index.html
let html = rd('web/index.html');
const safeJs = js => js.replace(/<\/script/gi, '<\\/script');
const safeCss = css => css.replace(/<\/style/gi, '<\\/style');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const file = href.startsWith('/vendor/codemirror/') ? `node_modules/codemirror/${href.slice(19)}` : `web${href}`;
  return fs.existsSync(path.join(ROOT, file)) ? `<style>${safeCss(rd(file))}</style>` : '';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const file = src.startsWith('/vendor/codemirror/') ? `node_modules/codemirror/${src.slice(19)}`
    : src.startsWith('/vendor/elk/') ? `node_modules/elkjs/lib/${src.slice(12)}` : `web${src}`;
  return `<script>${safeJs(rd(file))}</script>`;
});
// replacer functions: the inserted code may contain `$'`, `$&`… which a replacement string would expand
html = html.replace('<script type="module" src="/js/app.js"></script>',
  () => `<script>window.SILINX_STANDALONE = true;\nwindow.SILINX_FLOW_WORKER_SRC = ${safeJs(JSON.stringify(workerJs))};</script>\n<script type="module">${safeJs(appJs)}</script>`);
html = html.replace('<title>Silinx ISE Project Navigator</title>', () => '<title>Silinx ISE Project Navigator (standalone)</title>');
if (!html.includes(safeJs(appJs))) throw new Error('the app bundle was not inserted verbatim into the page');
// copyright and the licences of the components embedded in this single file (NOTICE + their texts
// from THIRD-PARTY-NOTICES.md), kept in the page as plain text
{
  const notices = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  const parts = [...notices.matchAll(/^## (codemirror|elkjs) [^\n]*\n[\s\S]*?\n```\n/gm)].map(m => m[0]);
  if (parts.length !== 2) throw new Error('THIRD-PARTY-NOTICES.md: the CodeMirror / elkjs sections were not found (run node scripts/third-party.mjs)');
  const text = `${fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')}\n# Embedded components\n\n${parts.join('\n')}`;
  html = html.replace('</head>', () => `<script type="text/plain" id="silinx-notices">\n${safeJs(text)}\n</script>\n</head>`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

// ---- the site (GitHub Pages): the page and its assets
const siteArg = process.argv.indexOf('--site');
if (siteArg > 0) {
  const site = path.resolve(process.argv[siteArg + 1] || 'site');
  const copyDir = (from, to, filter = () => true) => {
    fs.mkdirSync(to, { recursive: true });
    let n = 0, bytes = 0;
    for (const f of fs.readdirSync(from)) {
      const src = path.join(from, f);
      if (!fs.statSync(src).isFile() || !filter(f)) continue;
      fs.copyFileSync(src, path.join(to, f));
      n++; bytes += fs.statSync(src).size;
    }
    return { n, bytes };
  };
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, 'index.html'), html);
  fs.writeFileSync(path.join(site, 'Silinx-ISE.html'), html);
  const parts = [
    ['devices', copyDir(path.join(ROOT, 'core/fpga/devices'), path.join(site, 'assets/devices'), f => f.endsWith('.json.gz'))],
    ['bitdb', copyDir(path.join(ROOT, 'research/s3e-bitstream/db'), path.join(site, 'assets/bitdb'), f => f.endsWith('.json'))],
    ['yosys', copyDir(path.join(ROOT, 'node_modules/@yowasp/yosys/gen'), path.join(site, 'assets/vendor/yowasp-yosys/gen'))],
  ];
  // the licence of the WebAssembly Yosys published with the site (ISC; THIRD-PARTY-NOTICES.md)
  for (const f of ['LICENSE.txt', 'LICENSE', 'package.json']) {
    const src = path.join(ROOT, 'node_modules/@yowasp/yosys', f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(site, 'assets/vendor/yowasp-yosys', f));
  }
  for (const [k, { n, bytes }] of parts) console.log(`  site/assets/${k}: ${n} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`wrote the site in ${path.relative(ROOT, site) || site}`);
}
