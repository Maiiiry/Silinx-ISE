// The ASM chart editor's model operations (#405: out of mountAsmEditor in asm-editor.js): the boxes and arrows by id,
// new ids and unique names, the snap to the grid, an arrow connected (a decision's or a case's exits), a box added,
// the selection deleted, and Cut / Copy / Paste (#677).
import { copyDrawing, drawingClipEmpty, pasteDrawing } from '/core/drawclip.js';
import { nextCaseLabel as nextLabel, normalizeModel } from '/core/asm.js';
import { readClip, writeClip } from './clipboard.js';
import { GRID, box, nodeSize, portsOf } from './asm-editor.js';

/** { addNode, caseExits, caseWidth, connect, copySel, deleteSelection, drawTarget, exitsOf, nextCaseLabel, nodeById, paste, snapV } of mountAsmEditor (M(), destroyed(), sel(), snap(): its current values). */
export function mountAsmOps(ctx) {
  const {
    M, chartBounds, commit, destroyed, renderInspector, root, sel, snap, svg, toWorld, setSel, setM
  } = ctx;

  // ---------------------------------------------------------------------------- model ops
  const nodeById = (id) => M().nodes.find((n) => n.id === id);
  const exitsOf = (id) => {
    const o = {};
    for (const e of M().edges) if (e.from === id && !o[e.port]) o[e.port] = e;
    return o;
  };
  function newId(prefix) {
    const used = new Set([...M().nodes.map((n) => n.id), ...M().edges.map((e) => e.id)]);
    let i = 1;
    while (used.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }
  function uniqueStateName() {
    const used = new Set(M().nodes.filter((n) => n.type === 'state').map((n) => n.name.toLowerCase()));
    let i = 0;
    while (used.has(`s${i}`)) i++;
    return `S${i}`;
  }
  const snapV = (v) => (snap() ? Math.round(v / GRID) * GRID : Math.round(v));

  function connect(from, port, to) {
    M().edges = M().edges.filter((e) => !(e.from === from && e.port === port));
    const e = { id: newId('e'), from, to, port };
    M().edges.push(e);
    return e;
  }

  /** Width (bits) of the expression of a case box, or 1 if unknown. */
  function caseWidth(n) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:[[(]\s*(\d+)\s*(?:(?::|downto)\s*(\d+))?\s*[\])])?\s*$/i.exec(n.expr || '');
    if (!m) return 1;
    if (m[2] != null) return m[3] != null ? Math.abs(+m[2] - +m[3]) + 1 : 1;
    const p = [...M().inputs, ...M().outputs, ...(M().registers || [])].find((x) => x.name === m[1]);
    return p ? p.width : 1;
  }
  const caseExits = (id) => M().edges.filter((e) => e.from === id);
  /** Target of an exit as drawn: exits of a case box that share a target are spread apart. */
  function drawTarget(e) {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b || a.type !== 'case') return b;
    const sib = M().edges.filter((x) => x.from === e.from && x.to === e.to);
    if (sib.length < 2) return b;
    return { ...b, x: b.x + (sib.indexOf(e) - (sib.length - 1) / 2) * 22 };
  }
  /** Label for a new exit of a case box (see nextCaseLabel in core/asm.js), null when all values have one. */
  const nextCaseLabel = (n) => nextLabel(caseExits(n.id).map((e) => e.port), caseWidth(n));

  function uniqueBlockName() {
    const used = new Set(M().nodes.filter((n) => n.type === 'always').map((n) => (n.name || '').toLowerCase()));
    let i = 1;
    while (used.has(i === 1 ? 'every_cycle' : `every_cycle${i}`)) i++;
    return i === 1 ? 'every_cycle' : `every_cycle${i}`;
  }

  function addNode(type, at) {
    const n = { id: newId({ state: 's', decision: 'd', case: 'c', always: 'a' }[type] || 'o'), type, x: 0, y: 0 };
    if (type === 'state') { n.name = uniqueStateName(); n.actions = []; }
    if (type === 'always') { n.name = uniqueBlockName(); n.actions = []; }
    if (type === 'decision') n.cond = M().inputs[0]?.name || 'cond';
    if (type === 'case') n.expr = (M().inputs.find((i) => i.width > 1) || M().inputs[0])?.name || 'sel';
    if (type === 'output') n.actions = M().outputs[0] ? [`${M().outputs[0].name} = 1`] : [];
    const s = nodeSize(n);
    let parent = null, port = null;
    if (!at && sel().nodes.size === 1 && type !== 'always') {
      parent = nodeById([...sel().nodes][0]);
      const ex = exitsOf(parent.id);
      port = parent.type === 'case' ? nextCaseLabel(parent) : (portsOf(parent).find((p) => !ex[p]) || null);
      if (!port) parent = null;
    }
    if (at) { n.x = snapV(at.x); n.y = snapV(at.y); }
    else if (parent) {
      const pb = box(parent);
      if (port === 'false') {
        const dir = parent.flip ? -1 : 1;
        n.x = snapV(parent.x + dir * (pb.w / 2 + s.w / 2 + 60));
        n.y = snapV(parent.y + pb.h / 2 + 40 + s.h / 2);
      } else {
        n.x = parent.x;
        n.y = snapV(pb.b + 50 + s.h / 2 + (type === 'state' ? 20 : 0));
      }
    } else {
      const r = svg.getBoundingClientRect();
      const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      n.x = snapV(c.x); n.y = snapV(c.y);
      // find a free spot to the right of the chart if the centre is occupied
      const overlaps = () => {
        const a = box(n);
        return M().nodes.some((o) => { const b = box(o); return a.l < b.r + 30 && a.r > b.l - 30 && a.t < b.b + 40 && a.b > b.t - 40; });
      };
      if (type === 'always') { // to the right of the chart
        const bb = chartBounds();
        if (bb) { n.x = snapV(bb.r + s.w / 2 + 40); n.y = snapV(bb.t + 50 + s.h / 2); }
      }
      for (let i = 0; i < 200 && overlaps(); i++) n.x += GRID;
    }
    M().nodes.push(n);
    if (parent) connect(parent.id, port, n.id);
    if (type === 'state' && (!M().initial || !nodeById(M().initial))) M().initial = n.id;
    setSel({ nodes: new Set([n.id]), edge: null });
    commit('add');
    renderInspector();
    return n;
  }

  function deleteSelection() {
    if (sel().edge) {
      M().edges = M().edges.filter((e) => e.id !== sel().edge);
      sel().edge = null;
    } else if (sel().nodes.size) {
      M().nodes = M().nodes.filter((n) => !sel().nodes.has(n.id));
      M().edges = M().edges.filter((e) => !sel().nodes.has(e.from) && !sel().nodes.has(e.to));
      if (sel().nodes.has(M().initial)) M().initial = M().nodes.find((n) => n.type === 'state')?.id || '';
      sel().nodes.clear();
    } else return;
    commit('delete');
    renderInspector();
  }

  // Cut / Copy / Paste (#677, core/drawclip.js): the boxes selected and the connections between them, pasted
  // offset and selected, a state name already used made new
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (!sel().nodes.size) return;
    const clip = copyDrawing('asm', M(), [...sel().nodes]);
    writeClip('asm', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSelection();
  }
  async function paste(clip) {
    clip ??= await readClip('asm');
    if (drawingClipEmpty('asm', clip) || destroyed()) return;
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === M().name ? 0 : -1; }
    const d = 2 * GRID * ++pasteN;
    const { ids } = pasteDrawing('asm', M(), clip, { dx: d, dy: d });
    setM(normalizeModel(M()));
    if (!M().initial || !nodeById(M().initial)) M().initial = ids.find((id) => nodeById(id)?.type === 'state') || M().initial;
    setSel({ nodes: new Set(ids), edge: null });
    commit('paste');
    renderInspector();
    root.focus({ preventScroll: true });
  }

  return { addNode, caseExits, caseWidth, connect, copySel, deleteSelection, drawTarget, exitsOf, nextCaseLabel, nodeById, paste, snapV };
}
