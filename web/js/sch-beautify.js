// The schematic editor's Beautify (#1481): the wires drawn again for a clearer drawing (core/schbeautify.js), in one
// undo step. With a selection, its wires and the wires of its symbols and I/O markers; without one, the whole sheet.
import { beautifyWires } from '/core/schbeautify.js';
import { symbolPins } from '/core/schdoc.js';

/** { beautify } of mountSchEditor (doc(), modules(), sel(): its current values). */
export function mountSchBeautify(ctx) {
  const { doc, edit, flash, modules, sel } = ctx;

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
  function beautify() {
    const only = scope();
    if (only && !only.size) { flash('Beautify: no wire in the selection', 3000); return; }
    let n = 0;
    edit(() => { n = beautifyWires(doc(), { modules: modules(), only }).changed.length; }, { keepProps: true });
    flash(n ? `Beautify: ${n} wire${n === 1 ? '' : 's'} drawn again` : 'Beautify: the wires are already as clear as they can be', 3000);
  }

  return { beautify };
}
