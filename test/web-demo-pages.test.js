// The pages of web/ (the application and the developer demo pages, #484): the text a page puts into
// innerHTML / insertAdjacentHTML / outerHTML goes through its esc(); a value interpolated bare (`${x}`,
// `${a.b}`) is refused. The UI test test/ui/demo-pages.test.js checks the demo pages with hostile names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const SINK = /\b(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(/;
// a bare value: an identifier or a property chain, e.g. ${t}, ${i.path}, ${m?.name}
const BARE = /\$\{\s*[A-Za-z_$][\w$]*(\??\.[A-Za-z_$][\w$]*)*\s*\}/g;

/** The bare interpolations of the HTML sinks of a page's text: [{ line, expr }]. */
export function bareInterpolations(text) {
  const out = [];
  text.split('\n').forEach((l, i) => { if (SINK.test(l)) for (const m of l.matchAll(BARE)) out.push({ line: i + 1, expr: m[0] }); });
  return out;
}

test('#484 the check: a bare interpolation into innerHTML is found, an escaped one or a computed one is not', () => {
  assert.deepEqual(bareInterpolations("el.innerHTML = `<option value=\"${t}\">${t}</option>`;\nx.textContent = `${t}`;\nrow.innerHTML = `<b>${i.path}</b>${m?.name}`;"),
    [{ line: 1, expr: '${t}' }, { line: 1, expr: '${t}' }, { line: 3, expr: '${i.path}' }, { line: 3, expr: '${m?.name}' }]);
  assert.deepEqual(bareInterpolations('el.innerHTML = `<span>${esc(i.name)}</span>${i + 1}${n ? "▾" : ""}`;\nel.insertAdjacentHTML("beforeend", `${esc(t)}`);'), []);
});

test('#484 every page of web/ escapes what it puts into innerHTML', () => {
  const pages = fs.readdirSync(WEB).filter((f) => f.endsWith('.html'));
  assert.deepEqual(pages.filter((f) => /-demo\.html$/.test(f)).sort(), ['asm-demo.html', 'isim-demo.html', 'sch-editor-demo.html', 'schematic-demo.html']);
  const found = pages.flatMap((f) => bareInterpolations(fs.readFileSync(path.join(WEB, f), 'utf8')).map((b) => `${f}:${b.line}: ${b.expr}`));
  assert.deepEqual(found, []);
});
