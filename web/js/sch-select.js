// The schematic editor's selection operations (#405: out of mountSchEditor in sch-editor.js): the items selected,
// Delete, Select All, Rotate and Mirror, and Cut / Copy / Paste (#677, core/schclip.js: the selection with the wires
// joining it, pasted offset and untangled), Duplicate (#1556: its symbols and I/O markers only, beside it).
import { clipEmpty, copySchematic, pasteSchematic } from '/core/schclip.js';
import { GRID, oppositeSide, portBox, portSide, rotSize, symbolBox, symbolDef, turnSide } from '/core/schdoc.js';
import { readClip, writeClip } from './clipboard.js';
import { untangleNew } from '/core/schpath.js';
import { KEYS, snap } from './sch-editor.js';

/** { copySel, deleteSel, duplicateSel, mirrorSel, paste, rotateSel, selectAll, selected } of mountSchEditor (destroyed(), doc(), live(), modules(), placing(), sel(), tool(): its current values). */
export function mountSchSelect(ctx) {
  const {
    container, changed, destroyed, doc, edit, live, modules, placing, readOnly, refusedShort, render, renderOverlay,
    renderProps, sel, setTool, snapshot, tool, undoStack, setSel
  } = ctx;

  // ---------------- selection operations
  function selected(kind) { return [...sel()].filter(k => k.startsWith(kind + ':')).map(k => k.slice(kind.length + 1)); }
  // (the I/O markers selected: turned around their connection point, or to the opposite side, #296)
  const turnPorts = (ids, f) => { for (const id of ids) { const p = doc().ports.find(x => x.id === id); p.side = f(portSide(p)); if (p.side === portSide({ dir: p.dir })) delete p.side; } };
  function rotateSel() {
    if (tool() === 'place' && placing()) { placing().rot = (placing().rot + 90) % 360; renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => {
      turnPorts(pids, turnSide);
      for (const id of ids) {
        const s = doc().symbols.find(x => x.id === id);
        const def = symbolDef(s, modules());
        const a = rotSize(s, def);
        const cx = s.x + a.w / 2, cy = s.y + a.h / 2;
        s.rot = (s.rot + 90) % 360;
        const b = rotSize(s, def);
        s.x = snap(cx - b.w / 2); s.y = snap(cy - b.h / 2);
      }
    });
  }
  function mirrorSel() {
    if (tool() === 'place' && placing()) { placing().mirror = !placing().mirror; renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => { turnPorts(pids, oppositeSide); for (const id of ids) { const s = doc().symbols.find(x => x.id === id); s.mirror = !s.mirror; } });
  }
  function deleteSel() {
    if (!sel().size) return;
    edit(() => {
      for (const [kind, arr] of Object.entries(KEYS)) { const ids = new Set(selected(kind)); doc()[arr] = doc()[arr].filter(o => !ids.has(o.id)); }
      sel().clear();
    });
  }
  // Cut / Copy / Paste (#677, core/schclip.js): the selection with the wires joining it, through the app's
  // clipboard (web/js/clipboard.js), pasted offset, selected, with fresh names
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (!sel().size || readOnly || live()) return;
    const clip = copySchematic(doc(), { symbols: selected('sym'), wires: selected('wire'), ports: selected('port'), labels: selected('label') }, modules());
    writeClip('schematic', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSel();
  }
  async function paste(clip) {
    if (readOnly || live()) return;
    clip ??= await readClip('schematic');
    if (clipEmpty(clip) || destroyed()) return;
    // the same clipboard pasted again: one step further; another schematic's copy: where it was there
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === doc().name ? 0 : -1; }
    const d = 40 * ++pasteN;
    if (tool() !== 'select') setTool('select');
    const before = snapshot();
    edit(() => {
      const { ids } = pasteSchematic(doc(), clip, { dx: d, dy: d });
      // (its wires routed clear of what was there, #948)
      try { untangleNew(JSON.parse(before), doc(), { modules: modules(), prefer: ids.wires }); } catch (e) { console.error(e); }
      setSel(new Set([...ids.symbols.map(id => `sym:${id}`), ...ids.wires.map(id => `wire:${id}`), ...ids.ports.map(id => `port:${id}`), ...ids.labels.map(id => `label:${id}`)]));
    });
    if (refusedShort(before, 'Pasting')) { undoStack.pop(); changed(); }
    container.focus({ preventScroll: true });
  }
  // Duplicate (#1556, the right-click menu): the symbols and I/O markers selected copied without their wires, placed
  // right of them, with fresh names (as pasted); the copy selected
  function duplicateSel() {
    const ids = selected('sym'), pids = selected('port');
    if (readOnly || live() || (!ids.length && !pids.length)) return;
    const clip = { ...copySchematic(doc(), { symbols: ids, ports: pids }, modules()), wires: [], labels: [] };
    const boxes = [...doc().symbols.filter(s => ids.includes(s.id)).map(s => symbolBox(s, modules())), ...doc().ports.filter(p => pids.includes(p.id)).map(portBox)];
    const dx = snap(Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x))) + 2 * GRID;
    const before = snapshot();
    edit(() => {
      const r = pasteSchematic(doc(), clip, { dx, dy: 0 });
      setSel(new Set([...r.ids.symbols.map(id => `sym:${id}`), ...r.ids.ports.map(id => `port:${id}`)]));
    });
    if (refusedShort(before, 'Duplicating')) { undoStack.pop(); changed(); }
  }
  function selectAll() { setSel(new Set([...doc().symbols.map(s => `sym:${s.id}`), ...doc().wires.map(w => `wire:${w.id}`), ...doc().ports.map(p => `port:${p.id}`), ...doc().labels.map(l => `label:${l.id}`)])); render(); renderProps(); }

  return { copySel, deleteSel, duplicateSel, mirrorSel, paste, rotateSel, selectAll, selected };
}
