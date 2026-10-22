// Silinx - schematic wire paths that avoid overlaps (#948): the grid of what a wire's path must keep clear of, an
// orthogonal router on it (A*: few bends, around the symbols, parallel wires a grid step apart), the check of a
// drawn path, a wire drawn by hand nudged onto a clear path, and the wires of a generated schematic untangled.
//
// The rules (connectivity is geometric, at the ends only, #678; only the drawn path changes, never its ends):
//   - a path never runs along another wire's segment (it would look like a connection that is not there);
//   - it never passes over a pin, an I/O marker, a net name, or another wire's end or bend;
//   - it never enters a symbol's or a marker's body (a wire ending at a pin arrives from its outside);
//   - it bends only on a free point (not on another wire);
//   - it may cross another wire at a right angle (crossings do not connect; they get hop-overs, #756).
// Among the clear paths the router prefers few bends and crossings, and keeps away from parallel wires and from the
// edges of the bodies.
//
// Isomorphic ES module (browser + Node). schdoc.js's names are read inside functions only (an import cycle).
import { GRID, key, symbolBox, symbolPins, portBox, portSide } from './schdoc.js';

const DIRS = () => [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]];   // 0 E, 1 W (horizontal); 2 S, 3 N (vertical)
const SIDE_DIR = { E: 0, W: 1, S: 2, N: 3 };
const back = d => d ^ 1;
const COST = { step: 1, bend: 4, cross: 3, near: 2, edge: 1 };
const bump = (m, k, n) => { const c = (m.get(k) || 0) + n; if (c > 0) m.set(k, c); else m.delete(k); };

/** Grid points of the orthogonal segment a-b, both ends included (a diagonal one: its ends only). */
export function segPoints(a, b) {
  const out = [];
  if (a.x === b.x) { const s = Math.sign(b.y - a.y) || 1; for (let y = a.y; ; y += s * GRID) { out.push({ x: a.x, y }); if (y === b.y) break; } }
  else if (a.y === b.y) { const s = Math.sign(b.x - a.x) || 1; for (let x = a.x; ; x += s * GRID) { out.push({ x, y: a.y }); if (x === b.x) break; } }
  else out.push(a, b);
  return out;
}

/** Remove repeated and collinear points. */
export function cleanPath(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (l && l.x === p.x && l.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = l;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { out[out.length - 1] = { x: p.x, y: p.y }; continue; }
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * The grid of a document's obstacles, without the wires of `skip`. Its wires can be added and removed
 * (addWire / removeWire) as paths change. { fixed (pins, marker points), labels, vtx, h, v (wire segments'
 * inner points, horizontal / vertical), nearH, nearV (the points beside them), stepH, stepV (their unit steps), inner (inside a body),
 * edge (on a body's edge), side (point -> the direction a wire leaves a pin or a marker by), bounds }.
 */
export function wireGrid(doc, { modules = {}, skip = new Set() } = {}) {
  const g = {
    fixed: new Set(), labels: new Map(), vtx: new Map(), h: new Map(), v: new Map(), stepH: new Map(), stepV: new Map(), nearH: new Map(), nearV: new Map(),
    inner: new Set(), edge: new Set(), side: new Map(), bounds: null,
  };
  const xs = [], ys = [];
  const body = b => {
    xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h);
    for (let x = Math.ceil(b.x / GRID) * GRID; x <= b.x + b.w; x += GRID) {
      for (let y = Math.ceil(b.y / GRID) * GRID; y <= b.y + b.h; y += GRID) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) g.inner.add(key(x, y)); else g.edge.add(key(x, y));
      }
    }
  };
  for (const s of doc.symbols) {
    body(symbolBox(s, modules));
    for (const p of symbolPins(s, modules)) { g.fixed.add(key(p.x, p.y)); if (SIDE_DIR[p.side] != null) g.side.set(key(p.x, p.y), SIDE_DIR[p.side]); }
  }
  for (const p of doc.ports) {
    body(portBox(p));
    g.fixed.add(key(p.x, p.y));
    g.side.set(key(p.x, p.y), back(SIDE_DIR[portSide(p)]));
  }
  for (const l of doc.labels) bump(g.labels, key(l.x, l.y), 1);
  g.addWire = pts => paint(g, pts, 1);
  g.removeWire = pts => paint(g, pts, -1);
  for (const w of doc.wires) {
    if (skip.has(w.id)) continue;
    g.addWire(w.points);
    for (const p of w.points) { xs.push(p.x); ys.push(p.y); }
  }
  const M = 30 * GRID;
  g.bounds = xs.length ? { x0: Math.min(...xs) - M, x1: Math.max(...xs) + M, y0: Math.min(...ys) - M, y1: Math.max(...ys) + M }
    : { x0: -M, x1: M, y0: -M, y1: M };
  return g;
}

function paint(g, pts, n) {
  for (const p of pts) bump(g.vtx, key(p.x, p.y), n);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], hz = a.y === b.y, vt = a.x === b.x;
    if (hz === vt) continue;   // a diagonal: its ends only
    const P = segPoints(a, b);
    P.forEach((q, j) => {
      if (j > 0) bump(hz ? g.stepH : g.stepV, stepKey(P[j - 1], q), n);
      if (j > 0 && j < P.length - 1) bump(hz ? g.h : g.v, key(q.x, q.y), n);
      if (hz) { bump(g.nearH, key(q.x, q.y - GRID), n); bump(g.nearH, key(q.x, q.y + GRID), n); }
      else { bump(g.nearV, key(q.x - GRID, q.y), n); bump(g.nearV, key(q.x + GRID, q.y), n); }
    });
  }
}

/** Minimal binary heap keyed by f. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

/**
 * A clear orthogonal path from S to T on the grid (S and T may be on pins, markers, wires: a wire's end, or a
 * point inside it for a T junction). startDir / endDir: the direction of the first / last step (by default the
 * one leaving / entering the pin or marker there, when there is one); when no path has them, any is taken.
 * Returns the corner points, or null.
 */
export function routePath(g, S, T, { startDir, endDir, prefer = null, corners = null, maxNodes = 200000 } = {}) {
  const sd = startDir !== undefined ? startDir : g.side.get(key(S.x, S.y)) ?? null;
  const ed0 = endDir !== undefined ? endDir : g.side.get(key(T.x, T.y));
  const ed = ed0 == null ? null : endDir !== undefined ? ed0 : back(ed0);
  const o = { prefer, corners, maxNodes };
  return astar(g, S, T, sd, ed, o) || (sd != null || ed != null ? astar(g, S, T, null, null, o) : null);
}

// (prefer: the steps that cost half, corners: the points where a bend costs one step: a path drawn by hand)
function astar(g, S, T, sd, ed, { prefer, corners, maxNodes }) {
  if (S.x === T.x && S.y === T.y) return null;
  const D = DIRS();
  const B = g.bounds, M = 10 * GRID;
  const x0 = Math.min(B.x0, S.x - M, T.x - M), x1 = Math.max(B.x1, S.x + M, T.x + M);
  const y0 = Math.min(B.y0, S.y - M, T.y - M), y1 = Math.max(B.y1, S.y + M, T.y + M);
  const start = key(S.x, S.y), goal = key(T.x, T.y);
  const onWire = k => g.h.has(k) || g.v.has(k);
  const hd = (x, y) => (Math.abs(x - T.x) + Math.abs(y - T.y)) / GRID * (prefer ? 0.5 : 1);
  const best = new Map();
  const heap = new Heap();
  heap.push({ x: S.x, y: S.y, d: -1, g: 0, f: hd(S.x, S.y), prev: null });
  let n = 0;
  while (heap.size && n++ < maxNodes) {
    const cur = heap.pop();
    const ck = key(cur.x, cur.y);
    if (ck === goal) {
      const pts = [];
      for (let c = cur; c; c = c.prev) pts.push({ x: c.x, y: c.y });
      return cleanPath(pts.reverse());
    }
    if (best.get(`${ck},${cur.d}`) < cur.g) continue;
    for (let d = 0; d < 4; d++) {
      if (cur.d >= 0 && back(d) === cur.d) continue;                       // no U-turn
      const hz = d < 2;
      if (cur.d < 0) {
        if (sd != null && d !== sd) continue;
        if ((hz && g.h.has(start)) || (!hz && g.v.has(start))) continue;     // from inside a wire: across it
      }
      const turning = cur.d >= 0 && d !== cur.d;
      if (turning && onWire(ck)) continue;                                   // never bend on another wire
      const nx = cur.x + D[d][0], ny = cur.y + D[d][1];
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const k = key(nx, ny);
      if (k === start) continue;
      if (k === goal) { if (ed != null && d !== ed) continue; }
      else {
        if (g.fixed.has(k) || g.labels.has(k) || g.vtx.has(k) || g.inner.has(k)) continue;
        if ((hz && g.h.has(k)) || (!hz && g.v.has(k))) continue;             // along another wire
      }
      const cost = (prefer?.has(stepKey(cur, { x: nx, y: ny })) ? COST.step / 2 : COST.step)
        + (turning ? (corners?.has(ck) ? COST.step : COST.bend) : 0) + (k !== goal && onWire(k) ? COST.cross : 0)
        + ((hz ? g.nearH : g.nearV).has(k) ? COST.near : 0) + (g.edge.has(k) ? COST.edge : 0);
      const gg = cur.g + cost, sk = `${k},${d}`;
      if (best.has(sk) && best.get(sk) <= gg) continue;
      best.set(sk, gg);
      heap.push({ x: nx, y: ny, d, g: gg, f: gg + hd(nx, ny), prev: cur });
    }
  }
  return null;
}

/**
 * What a path breaks of the rules on the grid (its wire not in it): [{ kind, x, y }], kind 'overlap' (along
 * another wire), 'pin' (over a pin or a marker), 'touch' (over another wire's end or bend, or a bend on a wire),
 * 'label' (over a net name of another wire), 'body' (inside a symbol's or a marker's body), 'self' (along itself).
 * The path's own two ends may be on anything.
 */
export function pathViolations(g, pts) {
  const out = [];
  const n = pts.length;
  if (n < 2) return out;
  // the path's grid points in order: { q, bend (a corner of it), end (one of its two ends) }, and its unit steps
  const P = [], steps = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.y === b.y) === (a.x === b.x)) continue;   // a diagonal (or a repeated point)
    segPoints(a, b).forEach((q, j) => {
      if (j === 0 && P.length) { steps.push({ p: P[P.length - 1].q, q, hz: a.y === b.y }); return; }
      if (j > 0) steps.push({ p: P[P.length - 1].q, q, hz: a.y === b.y });
      P.push({ q });
    });
  }
  if (!P.length) return out;
  const corner = new Set(pts.slice(1, -1).map(q => key(q.x, q.y)));
  const own = new Set();
  for (const { p, q, hz } of steps) {
    const s = stepKey(p, q);
    if (own.has(s)) out.push({ kind: 'self', x: q.x, y: q.y }); else own.add(s);
    if ((hz ? g.stepH : g.stepV).has(s)) out.push({ kind: 'overlap', x: q.x, y: q.y });
  }
  P.forEach(({ q }, i) => {
    const k = key(q.x, q.y);
    if (g.inner.has(k)) out.push({ kind: 'body', x: q.x, y: q.y });
    if (i === 0 || i === P.length - 1) return;
    if (g.fixed.has(k)) out.push({ kind: 'pin', x: q.x, y: q.y });
    else if (g.vtx.has(k) || (corner.has(k) && (g.h.has(k) || g.v.has(k)))) out.push({ kind: 'touch', x: q.x, y: q.y });
    if (g.labels.has(k) && (g.h.has(k) || g.v.has(k) || g.vtx.has(k))) out.push({ kind: 'label', x: q.x, y: q.y });
  });
  return out;
}
const stepKey = (p, q) => (p.x < q.x || p.y < q.y ? `${key(p.x, p.y)}|${key(q.x, q.y)}` : `${key(q.x, q.y)}|${key(p.x, p.y)}`);

/**
 * The clashes of a document's wires: [{ wire, kind, x, y }] (pathViolations of each wire against all the others;
 * an overlap or a touch of two wires is listed for both).
 */
export function wireClashes(doc, { modules = {} } = {}) {
  const g = wireGrid(doc, { modules });
  const out = [];
  for (const w of doc.wires) {
    g.removeWire(w.points);
    for (const v of pathViolations(g, w.points)) out.push({ wire: w.id, ...v });
    g.addWire(w.points);
  }
  return out;
}

// the point of a path its net name goes on: a free point inside it (on no other wire, no pin, no other net name),
// the first one at 20 from the end `fromEnd` (0 its start, 1 its end), or the nearest one to it
function labelPoint(g, pts, fromEnd) {
  const P = fromEnd ? pts.slice().reverse() : pts;
  const all = [];
  for (let i = 0; i + 1 < P.length; i++) segPoints(P[i], P[i + 1]).forEach((q, j) => { if (j > 0 || i === 0) all.push(q); });
  const free = all.slice(1, -1).filter(q => { const k = key(q.x, q.y); return !g.fixed.has(k) && !g.labels.has(k) && !g.vtx.has(k) && !g.h.has(k) && !g.v.has(k); });
  if (!free.length) return null;
  return free.find(q => all.indexOf(q) >= 2) || free[0];
}

/**
 * A wire drawn by hand, nudged onto a clear path: the drawn path when it is clear; otherwise a path routed between
 * its two ends that follows the drawn one (its steps and corners cheaper) and leaves it only where it must; or else
 * the drawn path (nothing clear found). The ends never move.
 */
export function nudgeWire(doc, pts, { modules = {} } = {}) {
  pts = cleanPath(pts);
  if (pts.length < 2) return pts;
  const g = wireGrid(doc, { modules });
  if (!pathViolations(g, pts).length) return pts;
  const prefer = new Set(), corners = new Set(pts.slice(1, -1).map(q => key(q.x, q.y)));
  for (let i = 0; i + 1 < pts.length; i++) { const P = segPoints(pts[i], pts[i + 1]); for (let j = 1; j < P.length; j++) prefer.add(stepKey(P[j - 1], P[j])); }
  const path = routePath(g, pts[0], pts[pts.length - 1], { prefer, corners });
  return path && !pathViolations(g, path).length ? path : pts;
}

/**
 * The wires of a generated schematic untangled: each wire whose path breaks the rules routed again between its
 * two ends, its net names moved onto the new path. Wires keep their ids and ends: the connectivity is the same.
 * only: the ids of the wires that may change, in the order they are tried (by default all, in the document's);
 * known: the clashes to leave as they are ('kind@x,y').
 * Returns { rerouted: [ids], left: [ids] } (left: no clear path found, kept as they were).
 */
export function untangleWires(doc, { modules = {}, only = null, known = null, passes = 2, maxNodes = 60000 } = {}) {
  const g = wireGrid(doc, { modules });
  const rerouted = new Set(), left = new Set();
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    const list = only ? [...only].map(id => doc.wires.find(w => w.id === id)).filter(Boolean) : doc.wires;
    for (const w of list) {
      g.removeWire(w.points);
      if (!pathViolations(g, w.points).some(v => !known?.has(clashAt(v)))) { g.addWire(w.points); left.delete(w.id); continue; }
      const old = w.points, S = old[0], T = old[old.length - 1];
      // its net names (on the wire and on no other) are free to go: off the grid while it is routed
      const mine = doc.labels.filter(l => { const k = key(l.x, l.y); return !g.h.has(k) && !g.v.has(k) && !g.vtx.has(k) && onPath(old, l); });
      mine.forEach(l => bump(g.labels, key(l.x, l.y), -1));
      const pts = routePath(g, S, T, { maxNodes });
      let moves = null;
      if (pts && !pathViolations(g, pts).length) {
        moves = [];
        for (const l of mine) {
          if (onPath(pts, l) && !moves.some(m => m.x === l.x && m.y === l.y)) { moves.push({ l, x: l.x, y: l.y }); continue; }
          const q = labelPoint(g, pts, nearerEnd(old, l));
          if (!q) { moves = null; break; }
          moves.push({ l, x: q.x, y: q.y });
          bump(g.labels, key(q.x, q.y), 1);
        }
        if (moves) moves.forEach(m => bump(g.labels, key(m.x, m.y), -1));
      }
      if (moves) {
        w.points = pts;
        for (const m of moves) { m.l.x = m.x; m.l.y = m.y; }
        rerouted.add(w.id); left.delete(w.id); changed = true;
      } else left.add(w.id);
      for (const l of mine) bump(g.labels, key(l.x, l.y), 1);
      g.addWire(w.points);
    }
    if (!changed) break;
  }
  return { rerouted: [...rerouted], left: [...left] };
}

/**
 * After an edit (a move, a paste): the wires with a clash the document `before` did not have untangled
 * (untangleWires), the ones of `prefer` (the wires the edit made or stretched) tried first. A clash already there
 * stays: the rest of the drawing is not changed.
 */
export function untangleNew(before, doc, { modules = {}, prefer = [] } = {}) {
  const known = new Set(wireClashes(before, { modules }).map(clashAt));
  const ids = new Set(wireClashes(doc, { modules }).filter(c => !known.has(clashAt(c))).map(c => c.wire));
  if (!ids.size) return { rerouted: [], left: [] };
  const order = [...prefer.filter(id => ids.has(id)), ...doc.wires.map(w => w.id).filter(id => ids.has(id) && !prefer.includes(id))];
  return untangleWires(doc, { modules, only: order, known });
}

const clashAt = c => `${c.kind}@${c.x},${c.y}`;

function onPath(pts, p) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
    if (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true;
  }
  return false;
}
// 0 when p is nearer the path's start (along it), 1 when nearer its end
function nearerEnd(pts, p) {
  let d = 0, at = null, total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (at == null && onPath([a, b], p)) at = d + Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
    d += len; total += len;
  }
  return at != null && at > total / 2 ? 1 : 0;
}
