// Silinx C in the app (#1531): a C source is a module of the project whose HDL is made in memory from its top function
// (core/view-hdl.js); its Design row has the C as its base and its HDL, generated from it, shown read-only here.
import { h } from './dom.js';
import { S, findDoc, closeDoc, openDoc, openFile } from './app.js';
import { createEditor } from './editor.js';

export const isC = (p) => /\.c$/i.test(p || '');

/** The HDL made from a C source, read-only, in a document of its own (made again when it is opened again). */
export function openCHdl(path) {
  const src = S.sources.find((s) => s.view && s.path === path);
  const id = `chdl:${path}`;
  const old = findDoc(id);
  if (old) closeDoc(old);
  const lang = src?.lang === 'verilog' ? 'verilog' : 'vhdl';
  const name = `${src?.module || path.split('/').pop().replace(/\.c$/i, '')}.${lang === 'verilog' ? 'v' : 'vhd'}`;
  return openDoc({
    id, title: name, tooltip: `${name}, generated from ${path}`, icon: lang,
    create(el, d) {
      const link = h('a', { onclick: () => openFile(path) }, path.split('/').pop());
      const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'path' }, name), h('span', { class: 'gen-banner read-only' }, 'Read-only, generated from ', link));
      const host = h('div', { class: 'editor-host' });
      el.append(bar, host);
      d.editor = createEditor(host, { text: src?.text || '', lang, path: name, readOnly: true });
      return { lang, destroy: () => d.editor.destroy() };
    },
  });
}

/** A C module's badges on its Design row: the C (its base, opened) and its HDL (generated from it, read-only). */
export function cBadges(file, lang, context) {
  return [
    { text: 'C', base: true, title: 'Open', open: () => openFile(file), context },
    { text: lang === 'verilog' ? 'Verilog' : 'VHDL', base: false, title: 'Generated from the C', open: () => openCHdl(file), context },
  ];
}
