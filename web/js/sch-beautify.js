// The schematic editor's Beautify (#1481): a clearer drawing, in one undo step. Without a selection the whole sheet is
// laid out again (#1506, core/schbeautify-sheet.js: the inputs on the left, the outputs on the right, the symbols by
// the flow of the signals, with ELK's layout when the page has it) and its wires drawn again; with a selection, only
// its wires and the wires of its symbols and I/O markers are drawn again (core/schbeautify.js).
import { beautifyWires } from '/core/schbeautify.js';
import { beautifySheet } from '/core/schbeautify-sheet.js';
import { symbolPins } from '/core/schdoc.js';

/** { beautify } of mountSchEditor (doc(), modules(), sel(): its current values). */
export function mountSchBeautify(ctx) {
  const { doc, edit, fit, flash, modules, sel, snapshot } = ctx;
  let busy = false;

  // the wires the selection takes in (null: no selection, the whole sheet)
  function scope() {
    if (!sel().size) return null;
    const ids = new Set(), at = new Set();
    for (const k of sel()) {
      const [kind, id] = k.split(/:(.*)/s);
      if (kind === 'wire') ids.add(id);
      else if (kind === 'sym') { const s = doc().symbols.find(x => x.id === id); if (s) for (const p of symbolPins(s, modules())) at.add(`${p.x},${p.y}`); }
      else if (kind === 'port') { const p = doc().ports.find(x => x.id === id); if (p) at.add(`${p.x},${p.y}`); }
    }
    for (const w of doc().wires) if ([w.points[0], w.points[w.points.length - 1]].some(p => at.has(`${p.x},${p.y}`))) ids.add(w.id);
    return ids;
  }
  const wiresNote = n => (n ? `Beautify: ${n} wire${n === 1 ? '' : 's'} drawn again` : 'Beautify: the wires are already as clear as they can be');
  async function beautify() {
    const only = scope();
    if (only && !only.size) { flash('Beautify: no wire in the selection', 3000); return; }
    if (only) {
      let n = 0;
      edit(() => { n = beautifyWires(doc(), { modules: modules(), only }).changed.length; }, { keepProps: true });
      flash(wiresNote(n), 3000);
      return;
    }
    // the whole sheet: laid out on a copy (ELK answers later), taken in one edit unless the drawing changed meanwhile
    if (busy) return;
    busy = true;
    try {
      const before = snapshot(), d = JSON.parse(before);
      const elk = globalThis.ELK ? new globalThis.ELK() : null;
      const r = await beautifySheet(d, { modules: modules(), layout: elk ? g => elk.layout(g) : undefined });
      if (snapshot() !== before) return;
      edit(() => { for (const k of ['symbols', 'ports', 'wires', 'labels', 'sheet']) doc()[k] = d[k]; }, { keepProps: true });
      if (!r.sheet) { flash(wiresNote(r.changed.length), 3000); return; }
      if (snapshot() === before) { flash('Beautify: the schematic is already laid out this way', 3000); return; }
      fit();
      flash('Beautify: the schematic laid out again', 3000);
    } finally { busy = false; }
  }

  return { beautify };
}
