// The schematic editor's toolbar (#405: out of mountSchEditor in sch-editor.js): its tools and buttons (Select, Wire,
// Net Name, I/O Marker, Rotate, Mirror, Delete, Keep connections, Undo / Redo, the zooms, Symbol Info, Hop-overs,
// Names, Curved wires (#1144), Check, Try it, the panels on a narrow screen), the editing ones hidden when read-only, and their clicks.
import { PROPS_KEY, SYMBOLS_KEY, panelToggle } from './narrow.js';
import { h } from './dom.js';
import { undoButton } from './ui.js';
import { ICON } from './sch-editor.js';

/** { optBox } of mountSchEditor (live(): its current values). */
export function mountSchToolbar(ctx) {
  const {
    container, btn, canSim, curvedBox, deleteSel, enterSim, fit, hopsBox, infoTarget, keepBox, leaveSim, live, mirrorSel, namesBox,
    openInfo, readOnly, redo, rotateSel, runCheck, sep, setTool, tb, undo, zoomAt
  } = ctx;

  const optBox = h('span', { class: 'se-opts' });
  tb.append(
    btn('select', 'select', 'Select (Esc)'), btn('wire', 'wire', 'Add Wire (W)'), btn('net', 'net', 'Add Net Name (N)'), btn('io', 'io', 'Add I/O Marker (O)'),
    sep(), btn('rotate', 'rotate', 'Rotate (Ctrl+R)'), btn('mirror', 'mirror', 'Mirror (Ctrl+M)'), btn('delete', 'del', 'Delete (Del)'),
    sep(), h('label', { class: 'se-keep', title: 'Moving components: keep the wires connected (re-routed around other parts) or detach them' },
      keepBox, h('span', { text: 'Keep connections' })),
    h('label', { class: 'se-curved', title: 'Draw the wires as smooth curves of any shape instead of the technical drawing\'s square corners (the connections, the nets and the HDL the same)' },
      curvedBox, h('span', { text: 'Curved wires' })),
    sep(), undoButton('undo', undefined, { 'data-act': 'undo' }), undoButton('redo', undefined, { 'data-act': 'redo' }),
    sep(), btn('zin', 'zin', 'Zoom In (+)'), btn('zout', 'zout', 'Zoom Out (−)'), btn('fit', 'fit', 'Zoom to Full View (F)'),
    sep(), btn('info', 'info', 'Symbol Info (F1)'),
    sep(), h('label', { class: 'se-hops', title: 'Draw a small arc where two wires cross without connecting' }, hopsBox, h('span', { text: 'Hop-overs' })),
    h('label', { class: 'se-names', title: 'Show the name of every instance and every net (the automatic ones too)' }, namesBox, h('span', { text: 'Names' })),
    h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'check', title: 'Check Schematic', html: `${ICON.check}<span>Check</span>` }),
    sep(), h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'sim', title: 'Try it: click the inputs and watch the circuit work (Esc to stop)', html: `${ICON.sim}<span>Try it</span>` }),   // (not "Simulate": the design flow's, the waves, #992)
    sep(), optBox,
    // a narrow screen (#266): the symbols and the properties over the canvas, shown by these
    h('span', { class: 'se-panels' },
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'symbols', title: 'Show / hide the symbols panel' }, '☰ Symbols'), { cls: 'pal-open', key: SYMBOLS_KEY }),
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'props', title: 'Show / hide the properties panel' }, '☰ Properties'), { key: PROPS_KEY })),
  );
  // read-only (RTL view): the editing tools are hidden, so drop the separators they leave doubled
  if (readOnly) {
    let prevSep = true;                                   // a separator at the start is not needed
    let lastSep = null;
    for (const el of tb.children) {
      if (el.classList.contains('se-keep') || el.classList.contains('se-curved') || el.classList.contains('se-opts') || ['wire', 'net', 'io', 'rotate', 'mirror', 'delete', 'undo', 'redo'].includes(el.dataset.act) || (el.dataset.act === 'sim' && !canSim)) continue;   // hidden by .read-only CSS
      if (el.classList.contains('se-sep')) { if (prevSep) el.style.display = 'none'; else { prevSep = true; lastSep = el; } }
      else { prevSep = false; lastSep = null; }
    }
    if (lastSep) lastSep.style.display = 'none';          // nor at the end
  }
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'sim') { if (live()) leaveSim(); else enterSim(); container.focus({ preventScroll: true }); return; }
    if (a === 'info') { const t0 = infoTarget(); if (t0) openInfo(t0); return; }
    if (live() && !['zin', 'zout', 'fit', 'check'].includes(a)) return;
    if (a === 'select' || a === 'wire' || a === 'net' || a === 'io') setTool(a);
    else if (a === 'rotate') rotateSel(); else if (a === 'mirror') mirrorSel(); else if (a === 'delete') deleteSel();
    else if (a === 'undo') undo(); else if (a === 'redo') redo();
    else if (a === 'zin') zoomAt(1.25); else if (a === 'zout') zoomAt(0.8); else if (a === 'fit') fit();
    else if (a === 'check') runCheck(true);
    container.focus({ preventScroll: true });
  });

  return { optBox };
}
