// The schematic viewer's rendering (#405: out of mountSchematic in schematic-view.js): the laid-out graph drawn as SVG
// markup (the nets' routes with their bus widths and junctions, their labels, the nodes' shapes, the openable
// ones marked), its bounds, and the indices of the drawn nodes and nets for the hover and the selection.
import { esc } from './dom.js';
import { BOXES, FONT_SMALL, leaf, r1, textW } from './schematic-view.js';

/** { render } of mountSchematic (bounds(), content(), edgeNet(), layout(), netEls(), netInfo(), nodeEls(), prep(): its current values). */
export function mountSchRender(ctx) {
  const {
    bounds, content, edgeNet, layout, netEls, netInfo, nodeEls, prep, vp, setEdgeNet, setNetInfo, setBounds, setContent,
    setNodeEls, setNetEls
  } = ctx;

  // ---------------- render
  function render() {
    const pos = new Map();
    for (const c of layout().children || []) pos.set(c.id, c);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };

    // nets
    setEdgeNet(new Map()); setNetInfo(new Map());
    for (const e of prep().edges) {
      const key = e.net ? `n:${e.net}` : `d:${e.from.node}\u0001${e.from.port}`;
      edgeNet().set(e._eid, key);
      let ni = netInfo().get(key);
      if (!ni) {
        ni = { key, net: e.net || null, name: e.net ? leaf(e.net) : '', w: e.w || 1, edges: [], from: e.from, sinks: [] };
        netInfo().set(key, ni);
      }
      ni.edges.push(e);
      ni.sinks.push(e.to);
      if ((e.w || 1) > ni.w) ni.w = e.w;
    }

    const routes = new Map();
    for (const le of layout().edges || []) {
      const pts = [];
      for (const s of le.sections || []) {
        if (!pts.length) pts.push(s.startPoint);
        for (const b of s.bendPoints || []) pts.push(b);
        pts.push(s.endPoint);
      }
      routes.set(le.id, { pts, junctions: le.junctionPoints || [] });
    }

    // --- edges
    let eh = '';
    const junctions = new Map();
    const netLabelDone = new Set(), widthDone = new Set(), labelSegs = new Map();
    let labels = '';
    for (const e of prep().edges) {
      const r = routes.get(e._eid);
      if (!r || r.pts.length < 2) continue;
      const key = edgeNet().get(e._eid);
      const dstW = prep().shapes.get(e.to.node)?.pins[e.to.port]?.w;
      const ew = Math.min(e.w || 1, dstW > 0 ? dstW : Infinity);
      const bus = ew > 1;
      const d = 'M' + r.pts.map(p => `${r1(p.x)},${r1(p.y)}`).join('L');
      for (const p of r.pts) grow(p.x, p.y);
      eh += `<g class="edge${bus ? ' bus' : ''}" data-net="${esc(key)}" data-e="${esc(e._eid)}"><path class="hit" d="${d}"/><path class="wire" d="${d}"/></g>`;
      for (const j of r.junctions) junctions.set(`${r1(j.x)},${r1(j.y)}`, { key, bus, x: j.x, y: j.y });

      // bus slash + width near the driver (once per net)
      const srcKind = prep().byId.get(e.from.node)?.kind;
      if (bus && !widthDone.has(key) && !BOXES.has(srcKind)) {
        widthDone.add(key);
        const p0 = r.pts[0], p1 = r.pts[1];
        if (Math.abs(p0.y - p1.y) < 0.5 && Math.abs(p1.x - p0.x) >= 14) {
          const dir = p1.x > p0.x ? 1 : -1, x = p0.x + dir * 7;
          labels += `<g class="wann" data-net="${esc(key)}"><line class="slash" x1="${r1(x - 3)}" y1="${r1(p0.y + 4)}" x2="${r1(x + 3)}" y2="${r1(p0.y - 4)}"/>`
            + `<text class="wtext" x="${r1(x)}" y="${r1(p0.y + 12)}" text-anchor="middle">${esc(e.w)}</text></g>`;
        }
      }
      // net name, once per net, on the first long-enough horizontal run near the source
      const ni = netInfo().get(key);
      const srcNode = prep().byId.get(e.from.node), dstNode = prep().byId.get(e.to.node);
      const name = ni.name;
      const lab = e.label && e.label !== name ? e.label : '';
      if (name && !netLabelDone.has(key)) {
        const redundant = srcNode && ['in', 'inout', 'netlabel'].includes(srcNode.kind) && srcNode.label === name;
        const allToOut = ni.sinks.every(s => { const n = prep().byId.get(s.node); return n?.kind === 'out' && n.label === name; });
        if (redundant || allToOut) netLabelDone.add(key);
      }
      if (name && !netLabelDone.has(key)) {
        // collect horizontal runs; the label is placed after all edges are known
        let segs = labelSegs.get(key);
        if (!segs) labelSegs.set(key, segs = []);
        const sinkW = lab ? textW(lab, FONT_SMALL) + 8 : 0;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1];
          if (Math.abs(a.y - b.y) > 0.5 || Math.abs(b.x - a.x) < 1) continue;
          let x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
          if (i === 0) x1 += bus ? 18 : 3;
          if (i === r.pts.length - 2) x2 -= sinkW;
          segs.push({ x1, x2, y: a.y });
        }
      }
      // per-sink labels for slices (e.g. count[3]) near the sink end
      if (lab && !(dstNode && dstNode.kind === 'out' && dstNode.label === lab)) {
        const tw = textW(lab, FONT_SMALL);
        const n = r.pts.length;
        const a = r.pts[n - 2], b = r.pts[n - 1];
        if (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.x - a.x) >= tw + 8) {
          labels += `<text class="netlabel sink" data-net="${esc(key)}" x="${r1(b.x - 4)}" y="${r1(b.y - 3)}" text-anchor="end">${esc(lab)}</text>`;
        }
      }
    }
    // net names: longest junction-free horizontal run, text left-aligned in it
    const jByY = new Map();
    for (const j of junctions.values()) { const k = Math.round(j.y); let a = jByY.get(k); if (!a) jByY.set(k, a = []); a.push(j.x); }
    for (const [key, segs] of labelSegs) {
      const name = netInfo().get(key).name;
      const tw = textW(name, FONT_SMALL);
      let best = null;
      for (const sg of segs) {
        const cuts = (jByY.get(Math.round(sg.y)) || []).filter(x => x > sg.x1 && x < sg.x2).sort((a, b) => a - b);
        let lo = sg.x1;
        for (const c of [...cuts, sg.x2]) {
          const hi = c === sg.x2 ? c : c - 4;
          if (hi - lo >= tw + 8 && (!best || hi - lo > best.hi - best.lo + 0.5 || (Math.abs(hi - lo - (best.hi - best.lo)) <= 0.5 && sg.y < best.y))) best = { lo, hi, y: sg.y };
          lo = c + 4;
        }
        if (best && best.hi - best.lo > 4 * tw) break;    // good enough, keep it near the source
      }
      if (best) labels += `<text class="netlabel" data-net="${esc(key)}" x="${r1(best.lo + 4)}" y="${r1(best.y - 3)}">${esc(name)}</text>`;
    }
    let jh = '';
    for (const j of junctions.values()) jh += `<circle class="junction${j.bus ? ' bus' : ''}" data-net="${esc(j.key)}" cx="${r1(j.x)}" cy="${r1(j.y)}" r="${j.bus ? 3.2 : 2.4}"/>`;

    // --- nodes
    let nh = '';
    for (const n of prep().nodes) {
      const p = pos.get(n.id); if (!p) continue;
      const s = prep().shapes.get(n.id);
      grow(p.x - 4, p.y - 4); grow(p.x + s.w + 4, p.y + s.h + 4);
      const kcls = `k-${n.kind}${n.gate ? ' g-' + n.gate : ''}`;
      const openable = (n.kind === 'inst' && n.ref?.inst) || (n.ref?.file && ['gate', 'reg', 'comb', 'tb', 'blackbox'].includes(n.kind));
      nh += `<g class="node ${kcls}${openable ? ' openable' : ''}" data-node="${esc(n.id)}" transform="translate(${r1(p.x)},${r1(p.y)})">`
        + `<rect class="nodehit" x="0" y="0" width="${r1(s.w)}" height="${r1(s.h)}"/>${s.body}</g>`;
    }
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 100; }
    setBounds({ x: minX - 10, y: minY - 10, w: maxX - minX + 20, h: maxY - minY + 20 });
    setContent(`<g class="edges">${eh}</g><g class="anns">${labels}</g><g class="juncs">${jh}</g><g class="nodes">${nh}</g>`);
    vp.innerHTML = content();
    // indices
    setNodeEls(new Map());
    for (const el of vp.querySelectorAll('.node')) nodeEls().set(el.dataset.node, el);
    setNetEls(new Map());
    for (const el of vp.querySelectorAll('[data-net]')) {
      const k = el.dataset.net;
      let a = netEls().get(k); if (!a) netEls().set(k, a = []);
      a.push(el);
    }
  }

  return { render };
}
