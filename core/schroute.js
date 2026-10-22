// Schematic wire routing after moving symbols: the wires attached to moved pins are re-routed on
// the grid (orthogonal, few bends) so that every connection is kept and no new one is made.
//
// Connectivity in a schematic is geometric (core/schdoc.js netlist): wire ends, pins and ports at the
// same point connect (#678; a wire passing over them does not, but is avoided all the same). A route is
// therefore not allowed to bend on, end on, or run along anything of another net, nor to pass over
// a pin, an I/O marker, a net label or another wire's vertex; it may cross another wire at a right
// angle (crossings do not connect). Symbol bodies are avoided. The grid and the router are core/schpath.js's (#948).
//
// Isomorphic module (browser + Node).

import { GRID, symbolBox, symbolPins, netlist } from './schdoc.js';
import { cleanPath, routePath, segPoints, wireGrid } from './schpath.js';

const K = (x, y) => `${x},${y}`;

function onSeg(p, a, b) {
  if (a.x === b.x && p.x === a.x) return p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y && p.y === a.y) return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/**
 * A wire's segment i dragged by d across its direction (a horizontal one up or down, a vertical one left
 * or right, #688): its two neighbours stretch or shrink to stay attached, every other segment stays.
 * keepA / keepB: the wire's start / end stays where it is (connected there) when the segment is its
 * first / last: a short segment joins it to the moved one. Returns the new points (no duplicate points,
 * no point in the middle of a straight run); a diagonal segment, or d = 0, leaves the wire as it is.
 */
export function moveSegment(pts, i, d, { keepA = true, keepB = true } = {}) {
  const P = pts.map(p => ({ x: p.x, y: p.y })), n = P.length;
  const a = P[i], b = P[i + 1];
  if (!a || !b || !d) return P;
  const hz = a.y === b.y && a.x !== b.x, vt = a.x === b.x && a.y !== b.y;
  if (!hz && !vt) return P;
  const mv = p => (hz ? { x: p.x, y: p.y + d } : { x: p.x + d, y: p.y });
  // a neighbour across the segment's direction stretches to the moved end; otherwise (the wire's end,
  // or a neighbour in line) the old point stays and a short segment joins them
  const across = (q, p) => (hz ? q.x === p.x : q.y === p.y);   // q-p across the segment's direction
  const before = i === 0 ? (keepA ? [a] : []) : (across(P[i - 1], a) ? [] : [a]);
  const after = i + 1 === n - 1 ? (keepB ? [b] : []) : (across(P[i + 2], b) ? [] : [b]);
  const out = clean([...P.slice(0, i), ...before, mv(a), mv(b), ...after, ...P.slice(i + 2)]);
  return out.length >= 2 ? out : P;
}
const clean = cleanPath;

/**
 * Connectivity signature of a document: the groups of connected pins/markers (stable ids).
 */
export function connectivity(doc, modules = {}) {
  const nl = netlist(doc, { modules });
  return nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' '))
    .filter(s => s.includes(' ')).sort();
}

/**
 * Re-route wires after a move.
 * @param {object} doc       the document after the move (wires already stretched; mutated)
 * @param {object} orig      { wires } before the move
 * @param {Array}  attached  [{ id, a, b }] wires whose start (a) / end (b) was on a moved point
 * @param {number} dx, dy    the move
 * @returns {{ rerouted: number, failed: string[] }}
 */
export function rerouteAfterMove(doc, { orig, attached, dx, dy, modules = {} }) {
  const skip = new Set(attached.filter(at => !(at.a && at.b)).map(at => at.id));
  const grid = wireGrid(doc, { modules, skip });
  const failed = [];
  let rerouted = 0;
  // anchors: points on a wire that something else is attached to (other wire ends, labels, markers)
  const anchorPts = [];
  for (const w of doc.wires) if (!skip.has(w.id)) anchorPts.push(w.points[0], w.points[w.points.length - 1]);
  for (const l of doc.labels) anchorPts.push({ x: l.x, y: l.y });
  for (const p of doc.ports) anchorPts.push({ x: p.x, y: p.y });
  for (const at of attached) {
    if (at.a && at.b) continue;   // moved as a whole
    const w = doc.wires.find(x => x.id === at.id), w0 = orig.wires.find(x => x.id === at.id);
    if (!w || !w0) continue;
    let pts0 = w0.points.map(p => ({ ...p }));
    if (at.b) pts0.reverse();                                  // pts0[0] is the moved end
    const S = { x: pts0[0].x + dx, y: pts0[0].y + dy };
    // keep the original wire from the first anchor on, re-route up to it
    let cut = pts0.length - 1, T = pts0[pts0.length - 1];
    outer: for (let i = 0; i + 1 < pts0.length; i++) {
      for (const q of segPoints(pts0[i], pts0[i + 1])) {
        if (q.x === pts0[0].x && q.y === pts0[0].y) continue;
        if (anchorPts.some(p => p.x === q.x && p.y === q.y) || (i + 1 === pts0.length - 1 && q.x === pts0[i + 1].x && q.y === pts0[i + 1].y)) { cut = i; T = q; break outer; }
      }
    }
    const tail = [T, ...pts0.slice(cut + 1)];
    // the tail stays: the route must not run over it either
    grid.addWire(tail);
    const route = routePath(grid, S, T);
    grid.removeWire(tail);
    if (!route) { failed.push(w.id); continue; }
    let pts = clean([...route, ...tail.slice(1)]);
    if (at.b) pts = pts.reverse();
    w.points = pts;
    rerouted++;
    // the new wire is an obstacle for the next ones
    grid.addWire(pts);
  }
  return { rerouted, failed };
}

/**
 * Do the pins/markers of the moved items touch something they were not attached to (another
 * wire's vertex or segment, another pin or marker)? Used to nudge a dropped component.
 * moved: { symIds:Set, portIds:Set }, attachedIds: Set of wire ids stretched with the move.
 */
export function placementClashes(doc, { moved, attachedIds = new Set(), modules = {}, guard = null }) {
  // guard: only these pins/markers ('S1/O', 'port:P1') are checked for contacts — the ones that were
  // connected before the move (dropping a free pin or marker on something is a wanted connection)
  const pts = [];
  for (const s of doc.symbols) if (moved.symIds.has(s.id)) for (const p of symbolPins(s, modules)) if (!guard || guard.has(`${s.id}/${p.name}`)) pts.push(p);
  for (const p of doc.ports) if (moved.portIds.has(p.id) && (!guard || guard.has(`port:${p.id}`))) pts.push(p);
  const own = new Set(pts.map(p => K(p.x, p.y)));
  let n = 0;
  for (const p of pts) {
    for (const w of doc.wires) {
      if (attachedIds.has(w.id)) continue;
      if (w.points.some((q, i) => (q.x === p.x && q.y === p.y) || (i + 1 < w.points.length && onSeg(p, q, w.points[i + 1])))) n++;
    }
    for (const s of doc.symbols) if (!moved.symIds.has(s.id)) for (const q of symbolPins(s, modules)) if (q.x === p.x && q.y === p.y) n++;
    // a pin inside another component's body cannot be wired
    for (const s of doc.symbols) if (!moved.symIds.has(s.id)) { const b = symbolBox(s, modules); if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) n++; }
    for (const q of doc.ports) if (!moved.portIds.has(q.id) && q.x === p.x && q.y === p.y && !own.has(K(q.x, q.y))) n++;
  }
  // moved bodies covering wire points (vertices, or the far ends of the stretched wires)
  const covered = [];
  for (const w of doc.wires) {
    if (attachedIds.has(w.id)) covered.push(w.points[0], w.points[w.points.length - 1]);
    else covered.push(...w.points);
  }
  for (const s of doc.symbols) {
    if (!moved.symIds.has(s.id)) continue;
    const b = symbolBox(s, modules);
    for (const q of covered) if (q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h) n++;
  }
  // moved bodies overlapping other bodies
  const boxes = doc.symbols.map(s => ({ s, b: symbolBox(s, modules) }));
  for (const { s, b } of boxes) {
    if (!moved.symIds.has(s.id)) continue;
    for (const o of boxes) if (!moved.symIds.has(o.s.id) && b.x < o.b.x + o.b.w && o.b.x < b.x + b.w && b.y < o.b.y + o.b.h && o.b.y < b.y + b.h) n++;
  }
  return n;
}

/**
 * Did a move break or merge existing nets? New connections of pins/markers that were not
 * connected before are allowed. before/after: connectivity() results.
 */
export function connectionsKept(before, after) {
  const netOf = new Map();
  after.forEach((n, i) => n.split(' ').forEach(e => netOf.set(e, i)));
  const used = new Set();
  for (const n of before) {
    const ids = new Set(n.split(' ').map(e => netOf.get(e)));
    if (ids.size !== 1 || ids.has(undefined)) return false;      // split
    const id = [...ids][0];
    if (used.has(id)) return false;                               // merged with another net
    used.add(id);
  }
  return true;
}
