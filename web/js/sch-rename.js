// The schematic editor's right-click menu on a symbol, an I/O marker or a net name (#1546): the object selected,
// Rename… opens a small dialog with its name; a name core/schname.js refuses is said in the dialog, which stays open.
// The new name is given as the Properties panel gives it (a net name: with the whole net connected by name, #734,
// asked first when another net has it, #689), in one edit: one undo step, the HDL generated again.
import { popupMenu, dialog } from './ui.js';
import { h } from './dom.js';
import { renameError } from '/core/schname.js';
import { KEYS } from './sch-editor.js';

const TITLES = { sym: 'Rename Instance', port: 'Rename I/O Marker', label: 'Rename Net Name' };

/** { contextMenu, rename } of mountSchEditor (doc(), live(), nl(), tool(): its current values). */
export function mountSchRename(ctx) {
  const { readOnly, doc, live, nl, tool, edit, setSel, render, renderProps, joinByName, renameLabel } = ctx;

  const nameOf = (kind, o) => (kind === 'label' ? o.net : o.name);
  const find = it => doc()[KEYS[it.kind]]?.find(o => o.id === it.id);
  // a right-click (or a long press) on the sheet: the object under it selected, its menu shown
  function contextMenu(e, it) {
    if (readOnly || live() || tool() !== 'select' || !it || !TITLES[it.kind] || !find(it)) return;
    setSel(new Set([`${it.kind}:${it.id}`]));
    render(); renderProps();
    popupMenu([{ label: 'Rename…', action: () => rename(it) }], e.clientX, e.clientY);
  }
  async function rename(it) {
    const o = find(it);
    if (!o) return;
    const old = nameOf(it.kind, o);
    const input = h('input', { type: 'text', value: old, spellcheck: 'false', style: { width: '100%' }, 'data-no-i18n': '' });
    const err = h('div', { class: 'hint se-rename-err', style: { color: 'var(--error-fg)', minHeight: '16px' } });
    const check = () => { const v = input.value.trim(); return v === old ? null : renameError(doc(), it.kind, it.id, v); };
    input.addEventListener('input', () => { err.textContent = check() || ''; });
    const ok = await dialog({
      title: TITLES[it.kind], width: 380, className: 'se-rename-dlg',
      body: h('div', {}, h('div', { class: 'form-grid' }, h('label', { text: 'New name:' }), input), err),
      buttons: [{ label: 'Rename', primary: true, value: true, validate: () => { const m = check(); err.textContent = m || ''; return !m; } }, { label: 'Cancel', value: null }],
      onOpen: () => setTimeout(() => input.select(), 0),
    });
    const name = input.value.trim();
    if (!ok || name === old) return;
    if (it.kind === 'label') {
      const l = find(it);
      if (!l || !await joinByName(name, nl()?.labelNet.get(l.id))) return;
      edit(() => renameLabel(find(it), name));
      return;
    }
    edit(() => { find(it).name = name; });
  }

  return { contextMenu, rename };
}
