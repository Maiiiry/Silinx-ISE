// Silinx - the wires an ISE schematic export adds from an ISE library symbol's pin to where the Silinx symbol's pin
// was (#1798): the library symbols' pins are not all where the Silinx symbol's are (DCM_SP, the block RAMs, DSP48A1 …),
// and a wire of one net must never run along another net's (ISE's sch2hdl: "net … overlaps with net …"), end or turn
// on it, nor pass over another net's pin, vertex or name. Each such wire is routed on the grid around what the sheet
// already has (a least-cost path: short, few bends, outside the symbols' bodies), and is then itself in the way of
// the next ones. Isomorphic (no DOM, no Node APIs).

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// a binary heap of [cost, state]
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(c, s) {
      a.push([c, s]);
      for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    },
  };
}

/**
 * A router of the sheet's added wires, on a grid of `grid` ISE units. Nets are compared by identity; a null net
 * (an unconnected pin) is another net to every net.
 *   addSeg(net, x1, y1, x2, y2), addPoint(net, x, y), addBody(x0, y0, x1, y1): what is on the sheet;
 *   blocked(x, y, net): a point on another net's wire or point (a pin cannot go there);
 *   route(P, T, net): the points of a path from P to T ([[x, y] …], P and T included), or null.
 */
export function stubRouter(grid = 16) {
  const H = new Map(), V = new Map();      // y -> [[lo, hi, net]] / x -> [[lo, hi, net]]
  const pts = new Map();                   // 'x,y' -> Set(net)
  const bodies = [];
  const put = (m, k, v) => { let l = m.get(k); if (!l) m.set(k, l = []); l.push(v); };
  const addPoint = (net, x, y) => { const k = `${x},${y}`; let s = pts.get(k); if (!s) pts.set(k, s = new Set()); s.add(net); };
  const addSeg = (net, x1, y1, x2, y2) => {
    if (y1 === y2) put(H, y1, [Math.min(x1, x2), Math.max(x1, x2), net]);
    else if (x1 === x2) put(V, x1, [Math.min(y1, y2), Math.max(y1, y2), net]);
    addPoint(net, x1, y1); addPoint(net, x2, y2);
  };
  const addBody = (x0, y0, x1, y1) => bodies.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
  const foreignPt = (x, y, net) => {
    const s = pts.get(`${x},${y}`);
    if (s) for (const n of s) if (n !== net || n == null) return true;
    return false;
  };
  const onSeg = (x, y, net) => (H.get(y) || []).some(([lo, hi, n]) => (n !== net || n == null) && x >= lo && x <= hi)
    || (V.get(x) || []).some(([lo, hi, n]) => (n !== net || n == null) && y >= lo && y <= hi);
  const blocked = (x, y, net) => foreignPt(x, y, net) || onSeg(x, y, net);
  // a step from (x, y) along d runs over another net's wire
  const along = (x, y, d, net) => {
    const [dx, dy] = DIRS[d];
    if (dy === 0) { const lo = Math.min(x, x + dx * grid), hi = lo + grid; return (H.get(y) || []).some(([l, h, n]) => (n !== net || n == null) && Math.min(h, hi) - Math.max(l, lo) > 0); }
    const lo = Math.min(y, y + dy * grid), hi = lo + grid;
    return (V.get(x) || []).some(([l, h, n]) => (n !== net || n == null) && Math.min(h, hi) - Math.max(l, lo) > 0);
  };

  function route(P, T, net) {
    if (P[0] === T[0] && P[1] === T[1]) return [P];
    if ([P[0], P[1], T[0], T[1]].some(v => v % grid)) return null;
    const M = 40 * grid;
    const x0 = Math.min(P[0], T[0]) - M, x1 = Math.max(P[0], T[0]) + M, y0 = Math.min(P[1], T[1]) - M, y1 = Math.max(P[1], T[1]) + M;
    const W = (x1 - x0) / grid + 1, n4 = W * ((y1 - y0) / grid + 1) * 4;
    const id = (x, y, d) => ((((y - y0) / grid) * W + (x - x0) / grid) << 2) | d;
    const cost = new Float64Array(n4).fill(Infinity), from = new Int32Array(n4).fill(-1);
    const near = bodies.filter(([bx0, by0, bx1, by1]) => bx1 > x0 && bx0 < x1 && by1 > y0 && by0 < y1);
    const inBody = (x, y) => near.some(([bx0, by0, bx1, by1]) => x > bx0 && x < bx1 && y > by0 && y < by1);
    // (A*: the steps left to T, a lower bound of the cost)
    const h = (x, y) => (Math.abs(x - T[0]) + Math.abs(y - T[1])) / grid;
    const q = heap();
    const BEND = 6, BODY = 4;
    // (the start: any direction, no bend)
    for (let d = 0; d < 4; d++) { const s = id(P[0], P[1], d); cost[s] = 0; q.push(h(P[0], P[1]), s); }
    let end = null;
    while (q.size) {
      const [f, s] = q.pop(), c = cost[s];
      const d0 = s & 3, cell = s >> 2, x = x0 + (cell % W) * grid, y = y0 + Math.floor(cell / W) * grid;
      if (f > c + h(x, y)) continue;      // (a cheaper way here was found since)
      if (x === T[0] && y === T[1]) { end = s; break; }
      const start = x === P[0] && y === P[1];
      for (let d = 0; d < 4; d++) {
        if (!start && d === ((d0 + 2) & 3)) continue;
        const turn = !start && d !== d0;
        // (no turn on another net's wire)
        if (turn && onSeg(x, y, net)) continue;
        const nx = x + DIRS[d][0] * grid, ny = y + DIRS[d][1] * grid;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        // (the next point none of another net's; on another net's wire only crossing it)
        if (along(x, y, d, net) || foreignPt(nx, ny, net)) continue;
        const nc = c + 1 + (turn ? BEND : 0) + (inBody(nx, ny) ? BODY : 0);
        const ns = id(nx, ny, d);
        if (nc < cost[ns]) { cost[ns] = nc; from[ns] = s; q.push(nc + h(nx, ny), ns); }
      }
    }
    if (end == null) return null;
    // the path's corners, from P to T
    const cells = [];
    for (let s = end; s >= 0; s = from[s]) { const cell = s >> 2; cells.push([x0 + (cell % W) * grid, y0 + Math.floor(cell / W) * grid, s & 3]); }
    cells.reverse();
    const out = [[cells[0][0], cells[0][1]]];
    for (let i = 1; i < cells.length; i++) if (i === cells.length - 1 || cells[i + 1][2] !== cells[i][2]) out.push([cells[i][0], cells[i][1]]);
    return out;
  }
  return { addSeg, addPoint, addBody, blocked, route };
}

/** The router of an exported sheet: the drawing's wires (a diagonal piece as the export writes it, across then down),
 *  net names and I/O markers, by net, in ISE units (`X`: Silinx -> ISE). */
export function sheetRouter(doc, nets, portNet, X) {
  const R = stubRouter();
  const wire = new Map(doc.wires.map(w => [w.id, w])), label = new Map(doc.labels.map(l => [l.id, l]));
  for (const n of nets) {
    for (const id of n.wires) {
      const P = wire.get(id)?.points || [];
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i], b = P[i + 1];
        if (a.x !== b.x && a.y !== b.y) { R.addSeg(n, X(a.x), X(a.y), X(b.x), X(a.y)); R.addSeg(n, X(b.x), X(a.y), X(b.x), X(b.y)); }
        else R.addSeg(n, X(a.x), X(a.y), X(b.x), X(b.y));
      }
    }
    for (const id of n.labels) { const l = label.get(id); if (l) R.addPoint(n, X(l.x), X(l.y)); }
  }
  for (const p of doc.ports) R.addPoint(portNet.get(p.id) || null, X(p.x), X(p.y));
  return R;
}

/** The origin of a block among `ranked` ([x, y], the best first): the first where none of its pins ([dx, dy, net]) is
 *  on another net's wire or point, else one a few grid steps from the best, else the best. */
export function pickOrigin(R, ranked, pins, grid = 32) {
  const ok = ([ox, oy]) => pins.every(([dx, dy, n]) => !R.blocked(ox + dx, oy + dy, n));
  const hit = ranked.find(ok);
  if (hit) return hit;
  const [bx, by] = ranked[0];
  for (let r = 1; r <= 8; r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const o = [bx + i * grid, by + j * grid];
      if (ok(o)) return o;
    }
  }
  return ranked[0];
}

/** The block's pins on the sheet ([x, y, net], `origin` + `pins`'s offsets) in the router, its body between them. */
export function placeBlock(R, origin, pins) {
  if (!pins.length) return;
  const xs = pins.map(p => origin[0] + p[0]), ys = pins.map(p => origin[1] + p[1]);
  for (let i = 0; i < pins.length; i++) R.addPoint(pins[i][2], xs[i], ys[i]);
  R.addBody(Math.min(...xs), Math.min(...ys) - 32, Math.max(...xs), Math.max(...ys) + 32);
}

/** The wires from each ISE pin P to its Silinx pin T ({ net, P, T }), the shortest first, each passed as its pieces to
 *  add(net, [x1, y1, x2, y2]) (which puts it in the router): routed, or (no way found) across then along. */
export function routeStubs(R, stubs, add) {
  const len = s => Math.abs(s.P[0] - s.T[0]) + Math.abs(s.P[1] - s.T[1]);
  for (const s of [...stubs].sort((a, b) => len(a) - len(b))) {
    const { P, T, net } = s;
    const pts = R.route(P, T, net) || (P[0] !== T[0] && P[1] !== T[1] ? [P, [T[0], P[1]], T] : [P, T]);
    for (let i = 0; i + 1 < pts.length; i++) add(net, [pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
}
