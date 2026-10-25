// The schematic editor's freehand wire (#1052): with Add Wire, a stroke (a pen, a finger or the mouse) from a pin, an
// I/O marker or a wire, traced along any curve and lifted on another one, becomes a wire between those two points,
// routed square by the wire router (around the bodies, clear of the other wires, #948); the stroke's shape is
// dropped. A press that moves less than STROKE_MIN screen pixels is a click: the wire drawn corner by corner, as
// before. With Curved wires (#1144) the stroke's shape is kept: the wire's own curve, through the stroke's points
// (simplified), its rectilinear path still routed between its ends. A stroke lifted elsewhere does nothing. Shown as an ink trail while drawn (the drag's `ink`).
// mountStroke(ctx) is called by mountSchMouse.
import { cleanPath, routePath, wireGrid } from '/core/schpath.js';
import { simplify } from '/core/schcurve.js';
import { snap, segDist } from './sch-editor.js';

/** The length (screen pixels) from which a press that moves is a stroke rather than a click. */
const STROKE_MIN = 16;

/** { strokeStart, strokeMove, strokeEnd, strokeCancel } of a schematic editor (doc(), modules(), view(): its current ones). */
export function mountStroke(ctx) {
  const { doc, modules, view, curve, pinNear, finishWire, renderOverlay, setWireDraw } = ctx;

  // the connectable point at pt: a pin or a marker, else the nearest point of a wire (its end, a bend, a point of a
  // segment on the grid); or null. A finger's or a pen's tolerance: wider than a click's
  function endAt(pt) {
    const tol = 12 / Math.max(0.3, view().s);
    const p = pinNear(pt, tol);
    if (p) return { x: p.x, y: p.y };
    if (curve().curved()) return curve().wireAt(pt, tol)?.at || null;   // (on a curve, #1144)
    const clamp = (v, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
    let best = null, bd = tol;
    for (const w of doc().wires) for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1], d = segDist(pt, a, b);
      if (d > bd) continue;
      bd = d;
      best = a.x === b.x ? { x: a.x, y: clamp(snap(pt.y), a.y, b.y) } : { x: clamp(snap(pt.x), a.x, b.x), y: a.y };
    }
    return best;
  }
  // a press with Add Wire and no wire being drawn: a stroke if it starts on a connectable point (the drag), else null
  function strokeStart(pt, e) {
    const from = endAt(pt);
    return from && { kind: 'stroke', from, ink: [pt], len: 0, cx: e.clientX, cy: e.clientY, inking: false };
  }
  // a move: the ink trail; once long enough, a stroke (the wire begun by the press dropped)
  function strokeMove(d, pt, e) {
    d.len += Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
    d.cx = e.clientX; d.cy = e.clientY;
    d.ink.push(pt);
    if (!d.inking && d.len >= STROKE_MIN) { d.inking = true; setWireDraw(null); }
    renderOverlay();
  }
  // the release: a click (the wire drawn corner by corner goes on), or the wire routed between the stroke's ends
  function strokeEnd(d, pt) {
    if (!d.inking) return;
    const to = endAt(pt), from = d.from;
    if (!to || (to.x === from.x && to.y === from.y)) { renderOverlay(); return; }
    if (curve().curved()) {
      // (curved, #1144: the stroke's points, simplified, between the two ends; the path routed by finishWire)
      const near = 4 / Math.max(0.3, view().s), far = q => Math.hypot(q.x - from.x, q.y - from.y) > near && Math.hypot(q.x - to.x, q.y - to.y) > near;
      const mid = simplify(d.ink, 3 / Math.max(0.3, view().s)).slice(1, -1).filter(far);
      setWireDraw({ pts: [from, to], knots: [from, ...mid, to] });
      finishWire();
      return;
    }
    let pts = null;
    try { pts = routePath(wireGrid(doc(), { modules: modules() }), from, to); } catch (err) { console.error(err); }
    setWireDraw({ pts: pts || cleanPath([from, { x: to.x, y: from.y }, to]) });
    finishWire();
  }
  // a second finger (#674): the stroke dropped, nothing drawn
  function strokeCancel() { setWireDraw(null); renderOverlay(); }

  return { strokeStart, strokeMove, strokeEnd, strokeCancel };
}
