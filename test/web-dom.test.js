// web/js/dom.js, the client's one copy of its HTML helpers (#489): what they do, and that no other
// module or page of web/ keeps a copy of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../web/js/dom.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

test('#489 esc: the five HTML characters, each once, the rest as it is', () => {
  assert.equal(esc(`<a href="x" title='y'>&amp;</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;');
  assert.equal(esc('plain text, ü ⇒ 1'), 'plain text, ü ⇒ 1');
  assert.equal(esc('\\my<sig> '), '\\my&lt;sig&gt; ');
  assert.equal(esc(''), '');
  // what the browser reads back is the text given (an independent reference: the entities' meaning)
  const unesc = s => s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' }[e]));
  for (const s of ['a & b', '&amp;', `"'<>`, 'x" onerror="y', '&#39;']) assert.equal(unesc(esc(s)), s);
});

test('#489 esc: numbers and other values as text, null and undefined as nothing', () => {
  assert.equal(esc(42), '42');
  assert.equal(esc(0), '0');
  assert.equal(esc(false), 'false');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc({ toString: () => '<o>' }), '&lt;o&gt;');
});

// the pages and modules of the client, dom.js aside
const sources = () => [
  ...fs.readdirSync(WEB).filter(f => f.endsWith('.html')).map(f => path.join(WEB, f)),
  ...fs.readdirSync(path.join(WEB, 'js')).filter(f => f.endsWith('.js') && f !== 'dom.js').map(f => path.join(WEB, 'js', f)),
];
// an escape of its own: a function named esc / escH / escapeHtml, or a table of the entities
const ownEscape = code => /^\s*(?:export )?(?:const|let|function) (?:esc|escH|escapeHtml|escHtml)\b|['"]&lt;['"]/m.test(code);

test('#489 no module or page of web/ defines an HTML escape of its own', () => {
  const copies = sources().filter(f => ownEscape(fs.readFileSync(f, 'utf8'))).map(f => path.relative(WEB, f));
  assert.deepEqual(copies, []);
  // and the check finds one
  assert.equal(ownEscape("const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;' }[c]));"), true);
  assert.equal(ownEscape('function escH(s) { return s; }'), true);
  assert.equal(ownEscape("import { esc } from './dom.js';\nel.innerHTML = esc(x);"), false);
});

// an element builder of its own: a function or constant named h at a module's top level
const ownBuilder = code => /^(?:export )?(?:function h\(|(?:const|let) h = )/m.test(code);

test('#489 no module or page of web/ defines an element builder h of its own (ui.js re-exports dom.js\'s)', () => {
  const copies = sources().filter(f => ownBuilder(fs.readFileSync(f, 'utf8'))).map(f => path.relative(WEB, f));
  assert.deepEqual(copies, []);
  assert.match(fs.readFileSync(path.join(WEB, 'js', 'ui.js'), 'utf8'), /^import \{ h, esc \} from '\.\/dom\.js';$/m);
  assert.equal(ownBuilder('function h(tag, attrs = {}, ...kids) {}'), true);
  assert.equal(ownBuilder("const h = (tag, cls, html) => document.createElement(tag);"), true);
  // a local h inside a function (an SVG shape's height) is not one
  assert.equal(ownBuilder('function body(def) {\n  const h = def.h;\n}'), false);
});
