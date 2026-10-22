// The ASM chart editor's Arrange (#405: out of mountAsmEditor in asm-editor.js): the layout of the charts extracted from
// HDL (core/asm-from-hdl.js), or a layered layout when it is not available.
import { GRID, nodeSize } from './asm-editor.js';

/** { autoArrange } of mountAsmEditor (M(), destroyed(): its current values). */
export function mountAsmLayout(ctx) {
  const {
    M, caseExits, commit, destroyed, exitsOf, fit, nodeById
  } = ctx;

  // ---------------------------------------------------------------------------- layout
  // Arrange: the layout used for charts extracted from HDL (state blocks top-down in BFS order,
  // every-cycle blocks in a column on the right); the layered layout below is the fallback
  async function autoArrange() {
    if (!M().nodes.length) return;
    let asmLayout = null;
    try { ({ asmLayout } = await import('/core/asm-from-hdl.js')); } catch { /* not available: fallback */ }
    if (destroyed()) return;
    if (asmLayout) {
      try {
        const pos = new Map(asmLayout(M()).nodes.map((n) => [n.id, n]));
        for (const n of M().nodes) { const p = pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } }
        for (const e of M().edges) delete e.points;
        commit('arrange');
        fit();
        return;
      } catch { /* fallback */ }
    }
    layeredArrange();
  }
  function layeredArrange() {
    const layer = new Map(), parentOf = new Map();
    const order = [];
    const bfs = (start) => {
      if (layer.has(start)) return;
      let base = 0;
      for (const v of layer.values()) base = Math.max(base, v + 1);
      layer.set(start, base); order.push(start);
      const q = [start];
      while (q.length) {
        const id = q.shift();
        const ex = exitsOf(id);
        const ports = nodeById(id)?.type === 'case' ? caseExits(id).map((e) => e.port) : ['next', 'true', 'false'];
        for (const p of ports) {
          const e = ex[p];
          if (!e || layer.has(e.to) || !nodeById(e.to)) continue;
          layer.set(e.to, layer.get(id) + 1); parentOf.set(e.to, { id, port: p }); order.push(e.to); q.push(e.to);
        }
      }
    };
    if (nodeById(M().initial)) bfs(M().initial);
    for (const n of M().nodes) if (n.type === 'state') bfs(n.id);
    for (const n of M().nodes) bfs(n.id);
    const layers = [];
    for (const id of order) (layers[layer.get(id)] ||= []).push(nodeById(id));
    let y = 0;
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      if (!L) continue;
      const maxH = Math.max(...L.map((n) => nodeSize(n).h));
      const hasState = L.some((n) => n.type === 'state');
      y += maxH / 2 + (hasState && li ? 24 : 0);
      const want = L.map((n) => {
        const p = parentOf.get(n.id);
        if (!p) return 0;
        const par = nodeById(p.id);
        if (p.port === 'false') {
          const dir = par.flip ? -1 : 1;
          return par.x + dir * (nodeSize(par).w / 2 + nodeSize(n).w / 2 + 50);
        }
        return par.x;
      });
      const idxs = L.map((_, i) => i).sort((a, b) => want[a] - want[b] || a - b);
      const xs = [];
      idxs.forEach((i, k) => {
        let x = want[i];
        if (k) {
          const pi = idxs[k - 1];
          const min = xs[pi] + nodeSize(L[pi]).w / 2 + nodeSize(L[i]).w / 2 + 50;
          x = Math.max(x, min);
        }
        xs[i] = x;
      });
      const shift = xs.reduce((s, x, i) => s + (x - want[i]), 0) / xs.length;
      L.forEach((n, i) => { n.x = Math.round((xs[i] - shift) / GRID) * GRID; n.y = Math.round(y / GRID) * GRID; });
      y += maxH / 2 + 60;
    }
    for (const e of M().edges) delete e.points;
    commit('arrange');
    fit();
  }

  return { autoArrange };
}
