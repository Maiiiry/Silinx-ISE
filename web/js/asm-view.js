// The ASM chart editor's view (#405: out of mountAsmEditor in asm-editor.js): the drawing's transform and zoom label,
// screen to drawing and back, the zoom about a point, the fit, and the print.
import { printDiagram, svgSnapshot } from './print.js';
import { box, clamp } from './asm-editor.js';

/** { applyView, centerOn, chartBounds, fit, print, toWorld, zoomAt, zoomBy } of mountAsmEditor (M(), fitted(), sel(), view(): its current values). */
export function mountAsmView(ctx) {
  const {
    M, fitted, pattern, render, sel, svg, view, vp, zoomLbl, setView, setFitted, setSel
  } = ctx;

  // ---------------------------------------------------------------------------- view
  function applyView() {
    vp.setAttribute('transform', `translate(${view().tx},${view().ty}) scale(${view().k})`);
    pattern.setAttribute('patternTransform', `translate(${view().tx},${view().ty}) scale(${view().k})`);
    zoomLbl.textContent = `${Math.round(view().k * 100)}%`;
  }
  function toWorld(cx, cy) {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left - view().tx) / view().k, y: (cy - r.top - view().ty) / view().k };
  }
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = clamp(view().k * f, 0.2, 4);
    setFitted(true);
    view().tx = px - ((px - view().tx) * k) / view().k;
    view().ty = py - ((py - view().ty) * k) / view().k;
    view().k = k;
    applyView();
  }
  function zoomBy(f) {
    const r = svg.getBoundingClientRect();
    zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
  }
  function chartBounds() {
    if (!M().nodes.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of M().nodes) {
      const bx = box(n);
      l = Math.min(l, bx.l - 50); r = Math.max(r, bx.r + 50); t = Math.min(t, bx.t - (n.type === 'state' || n.type === 'always' ? 50 : 20)); b = Math.max(b, bx.b + 40);
    }
    return { l, t, r, b };
  }
  /** Print dialog for the whole chart (selection and editing handles left out). */
  function print() {
    const bb = chartBounds();
    if (!bb) return;
    const saved = sel();
    setSel({ nodes: new Set(), edge: null });
    render();
    let snap;
    try { snap = svgSnapshot(svg, vp, bb, ['.asm-bg', '.asm-rubber', '.asm-port', '.asm-overlay > *', 'defs pattern']); } finally { setSel(saved); render(); }
    printDiagram({ title: `ASM chart ${M().name}`, snapshot: snap, filename: `${M().name}_asm` });
  }
  function fit() {
    const bb = chartBounds();
    const r = svg.getBoundingClientRect();
    if (!bb || r.width < 10 || r.height < 10) { setView({ tx: 40, ty: 40, k: 1 }); applyView(); return; }
    const pad = 30;
    const k = clamp(Math.min((r.width - 2 * pad) / (bb.r - bb.l), (r.height - 2 * pad) / (bb.b - bb.t)), 0.2, 1.25);
    view().k = k;
    view().tx = (r.width - (bb.r - bb.l) * k) / 2 - bb.l * k;
    view().ty = (r.height - (bb.b - bb.t) * k) / 2 - bb.t * k;
    applyView();
  }
  function centerOn(n) {
    const r = svg.getBoundingClientRect();
    view().tx = r.width / 2 - n.x * view().k;
    view().ty = r.height / 2 - n.y * view().k;
    applyView();
  }

  return { applyView, centerOn, chartBounds, fit, print, toWorld, zoomAt, zoomBy };
}
