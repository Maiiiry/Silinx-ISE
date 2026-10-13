// Refactoring in the HDL editor: Rename Symbol (F2, or the editor's right-click menu) renames the
// name under the cursor everywhere it means the same object in the file (core/rename.js), as one
// edit that one Undo reverts; a port or generic of a module also follows in the instances of the
// module in the other files of the project.
import { renameSymbol, symbolAt, badName, kindWord, interfaceUnit, renameInterfaceInSource } from '/core/rename.js';
import { h, dialog, toast } from './ui.js';

/** Replace [{ line, col, len }] (1-based, of the current text) by `name` in one undoable step. */
export function applyEdits(cm, edits, name) {
  const Pos = window.CodeMirror.Pos;
  const sorted = [...edits].sort((a, b) => b.line - a.line || b.col - a.col);
  cm.operation(() => {
    for (const e of sorted) cm.replaceRange(name, Pos(e.line - 1, e.col - 1), Pos(e.line - 1, e.col - 1 + e.len), 'rename');
  });
}

/**
 * Rename the name at the cursor of an editor.
 * ctx: { cm, lang, path, sources: () => [{ path, lang, text }] (the other HDL files of the project),
 *        writeSource: async (path, text, edits, name), renameModule: (name) (the project-wide
 *        rename of a module / entity) }
 */
export async function renameSymbolAtCursor(ctx) {
  const { cm, lang } = ctx;
  if (lang !== 'vhdl' && lang !== 'verilog') return;
  const cur = cm.getCursor();
  const text = cm.getValue();
  const at = symbolAt(text, lang, cur.line + 1, cur.ch + 1);
  if (at.error) { toast(at.error, 'info', 4000); return; }
  const { sym } = at;
  // a module / entity (and a component of one) is renamed in the whole project, with its file
  if (sym.kind === 'module' || sym.kind === 'entity' || (sym.kind === 'component' && ctx.isModule?.(sym.name))) { ctx.renameModule(sym.name); return; }

  // the instances of the module in the other files (port map formals, VHDL components)
  const unit = interfaceUnit(sym);
  const others = unit ? ctx.sources().filter(s => s.path !== ctx.path && renameInterfaceInSource(s.text, s.lang, unit.name, sym.name, sym.name + '_').count) : [];
  // the drawings without an HDL file that instance it: their HDL is made from them, not changed here
  const drawings = unit ? (ctx.drawings?.() || []).filter(s => renameInterfaceInSource(s.text, s.lang, unit.name, sym.name, sym.name + '_').count) : [];
  const count = renameSymbol(text, lang, cur.line + 1, cur.ch + 1, sym.name).count;
  const input = h('input', { type: 'text', value: sym.name, spellcheck: 'false', style: { width: '100%' }, 'data-no-i18n': true });
  const err = h('div', { class: 'hint rename-error', style: { color: 'var(--error-fg)', minHeight: '16px' } });
  const also = others.length ? h('input', { type: 'checkbox', checked: true }) : null;
  const check = () => {
    const nm = input.value.trim();
    if (nm === sym.name) return null;
    const r = renameSymbol(cm.getValue(), lang, cur.line + 1, cur.ch + 1, nm);
    return r.error || null;
  };
  input.addEventListener('input', () => { err.textContent = input.value.trim() === sym.name ? '' : badName(input.value.trim(), lang) || ''; });
  const r = await dialog({
    title: 'Rename Symbol', width: 480, className: 'rename-dlg',
    body: h('div', {},
      h('div', { class: 'form-grid' }, h('label', {}, 'New name:'), input),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, `Renames the ${kindWord(sym)} '${sym.name}' everywhere it is used in this file: ${count} ${count === 1 ? 'place' : 'places'}.`),
      also ? h('label', { style: { display: 'block', marginTop: '6px' } }, also, ` Also in the instances of '${unit.name}' in the other files (${others.map(s => s.path).join(', ')})`)
        : unit && !drawings.length ? h('div', { class: 'hint' }, `No other file of the project instantiates '${unit.name}'.`) : null,
      drawings.length ? h('div', { class: 'hint' }, `Not changed: the instances of '${unit.name}' in ${drawings.map(s => s.path).join(', ')} (made from the drawing: change them there).`) : null,
      err),
    buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
    onOpen: () => setTimeout(() => input.select(), 0),
  });
  if (!r) { cm.focus(); return; }
  const name = input.value.trim();
  if (name === sym.name) { cm.focus(); return; }
  const res = renameSymbol(cm.getValue(), lang, cur.line + 1, cur.ch + 1, name);
  if (res.error) { toast(res.error, 'error', 5000); return; }
  applyEdits(cm, res.edits, name);
  let files = 0;
  if (also?.checked) {
    for (const s of others) {
      const o = renameInterfaceInSource(s.text, s.lang, unit.name, sym.name, name);
      if (o.count) { await ctx.writeSource(s.path, o.text, o.edits, name); files++; }
    }
  }
  cm.focus();
  toast(files ? `Renamed '${sym.name}' to '${name}': ${res.count} in this file, and in ${files} other ${files === 1 ? 'file' : 'files'}.` : `Renamed '${sym.name}' to '${name}' (${res.count} ${res.count === 1 ? 'place' : 'places'}).`, 'info', 4000);
}
