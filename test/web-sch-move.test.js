// The schematic editor's drags that change the drawing (web/js/sch-move.js, #405: out of mountSchEditor), on real
// documents: the document's geometry (symbolPins) and connectivity (core/schroute.js) are the reference. A symbol moved
// with its wires stretched, with Keep Connections off, a pin touching another one directly; a wire's segment dragged
// with its net name, a short refused (#806); a wire's kept ends and a stretched wire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { normalizeDoc, symbolPins } from '../core/schdoc.js';
import { connectivity, connectionsKept } from '../core/schroute.js';

const { mountMove, keptEnds, rubber } = await import('../web/js/sch-move.js');
globalThis.requestAnimationFrame ??= (f) => { f(); return 0; };

// an inverter U1 between the I/O markers A and Y, each joined by a wire with a bend; a net name on Y's wire
function editorOf(extra = {}, { keepConn = true, refuse = false } = {}) {
  const inv = { id: 'S1', type: 'inv', name: 'U1', x: 200, y: 100 };
  const [I, O] = symbolPins(normalizeDoc({ symbols: [inv] }).symbols[0]);
  let doc = normalizeDoc({ name: 'top', symbols: [inv, ...(extra.symbols || [])],
    ports: [{ id: 'P1', name: 'A', dir: 'in', x: I.x - 80, y: I.y + 40 }, { id: 'P2', name: 'Y', dir: 'out', x: O.x + 80, y: O.y }],
    wires: [{ id: 'W1', points: [{ x: I.x - 80, y: I.y + 40 }, { x: I.x - 40, y: I.y + 40 }, { x: I.x - 40, y: I.y }, { x: I.x, y: I.y }] },
      { id: 'W2', points: [{ x: O.x, y: O.y }, { x: O.x + 80, y: O.y }] }],
    labels: [{ id: 'L1', x: O.x + 40, y: O.y, net: 'y' }] });
  let sel = new Set(['sym:S1']);
  const seen = [];
  const m = mountMove({ doc: () => doc, setDoc: (d) => { doc = d; }, modules: () => ({}), keepConn: () => keepConn,
    selected: (kind) => [...sel].filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1)),
    connPoints: () => [...doc.symbols.flatMap((s) => symbolPins(s)), ...doc.ports].map((p) => ({ x: p.x, y: p.y })),
    snapshot: () => JSON.stringify(doc), pushUndo: () => seen.push('undo'), changed: () => seen.push('changed'), render: () => {}, renderProps: () => {},
    flash: (t) => seen.push(`flash ${t.slice(0, 30)}`), nextId: (p, arr) => `${p}${arr.length + 1}`,
    refusedShort: (before, what) => { seen.push(`short? ${what}`); return refuse; } });
  return { ...m, doc: () => doc, setSel: (s) => { sel = new Set(s); }, seen, I, O };
}
const ends = (w) => [w.points[0], w.points[w.points.length - 1]].map((p) => `${p.x},${p.y}`);
const pinsOf = (doc, id) => symbolPins(doc.symbols.find((s) => s.id === id)).map((p) => `${p.x},${p.y}`);

test('#405 schematic move: a symbol moved, its wires stretched to its pins, the markers and the net name where they were', () => {
  const e = editorOf();
  const conn0 = connectivity(e.doc());
  const m = e.beginMove({ x: 0, y: 0 });
  for (const [dx, dy] of [[20, 0], [60, 30], [40, -50]]) {
    e.applyMove(m, dx, dy);
    const d = e.doc(), [I, O] = pinsOf(d, 'S1');
    assert.deepEqual(d.symbols[0].x, 200 + dx);
    // the wires still end at the pins (the reference: the document's pins), and at the markers, which stayed
    assert.deepEqual(ends(d.wires.find((w) => w.id === 'W1')), [`${e.I.x - 80},${e.I.y + 40}`, I], `${dx},${dy}`);
    assert.deepEqual(ends(d.wires.find((w) => w.id === 'W2')), [O, `${e.O.x + 80},${e.O.y}`], `${dx},${dy}`);
    for (const w of d.wires) for (let i = 0; i + 1 < w.points.length; i++) {
      const p = w.points[i], q = w.points[i + 1];
      assert.ok(p.x === q.x || p.y === q.y, `${w.id} square at ${dx},${dy}`);
    }
    assert.deepEqual(d.labels.map((l) => [l.x, l.y]), [[e.O.x + 40, e.O.y]]);
    // nothing connected or disconnected
    assert.ok(connectionsKept(conn0, connectivity(d)), `${dx},${dy}`);
  }
  // back where it was: the wires as they were
  e.applyMove(m, 0, 0);
  assert.deepEqual(e.doc().wires.map((w) => w.points.length), [4, 2]);
});

test('#405 schematic move: Keep Connections off, the wires stay; a pin on another pin gets a wire', () => {
  const off = editorOf({}, { keepConn: false });
  const m = off.beginMove({ x: 0, y: 0 });
  const w0 = JSON.stringify(off.doc().wires);
  off.applyMove(m, 40, 20);
  assert.equal(JSON.stringify(off.doc().wires), w0);
  assert.equal(off.doc().symbols[0].x, 240);
  // U2 an inverter with its input on U1's output, no wire: moving U2 adds one, kept on both pins
  const inv = { type: 'inv', x: 0, y: 0 };
  const [I2] = symbolPins(normalizeDoc({ symbols: [inv] }).symbols[0]);
  const e = editorOf({ symbols: [{ id: 'S2', type: 'inv', name: 'U2', x: 0, y: 0 }] });
  const [, O] = pinsOf(e.doc(), 'S1').map((k) => k.split(',').map(Number));
  e.doc().symbols[1].x = O[0] - I2.x; e.doc().symbols[1].y = O[1] - I2.y;
  e.doc().wires = e.doc().wires.filter((w) => w.id !== 'W2'); e.doc().labels = []; e.doc().ports = e.doc().ports.filter((p) => p.id !== 'P2');
  e.setSel(['sym:S2']);
  const m2 = e.beginMove({ x: 0, y: 0 });
  assert.equal(m2.synth.length, 1);
  e.applyMove(m2, 40, 60);
  const w = e.doc().wires.find((x) => x.id === m2.synth[0]);
  assert.deepEqual(ends(w).sort(), [pinsOf(e.doc(), 'S1')[1], pinsOf(e.doc(), 'S2')[0]].sort());
});

test('#405 schematic move: one segment of a wire dragged, its net name with it, its ends kept; the change said when connections change', () => {
  const e = editorOf();
  const conn0 = connectivity(e.doc());
  // W1's vertical segment (x = I.x - 40), dragged 20 to the left
  const s = e.beginSegMove('W1', { x: e.I.x - 40, y: e.I.y + 20 });
  assert.equal(s.hz, false);
  assert.deepEqual([s.keepA, s.keepB], [true, true]);
  e.applySegMove(s, -20);
  assert.deepEqual(e.doc().wires[0].points.map((p) => [p.x, p.y]), [[e.I.x - 80, e.I.y + 40], [e.I.x - 60, e.I.y + 40], [e.I.x - 60, e.I.y], [e.I.x, e.I.y]]);
  const before = e.doc();
  e.finishSegMove(s);
  assert.notEqual(e.doc(), before);   // (a new document, normalized)
  assert.deepEqual(e.seen.splice(0), ['short? The move', 'undo', 'changed']);
  assert.ok(connectionsKept(conn0, connectivity(e.doc())));
  // W2's segment (horizontal, the net name on it) dragged down: the name goes with it
  const t = e.beginSegMove('W2', { x: e.O.x + 40, y: e.O.y });
  e.applySegMove(t, 30);
  assert.deepEqual(e.doc().labels.map((l) => [l.x, l.y]), [[e.O.x + 40, e.O.y + 30]]);
  assert.deepEqual(ends(e.doc().wires[1]), [`${e.O.x},${e.O.y}`, `${e.O.x + 80},${e.O.y}`]);
  // a point that is no segment: none
  assert.equal(e.beginSegMove('W9', { x: 0, y: 0 }), null);
  // a short of two named nets refused (#806): nothing to undo, nothing said here (refusedShort restores and says it)
  const r = editorOf({}, { refuse: true });
  const s2 = r.beginSegMove('W1', { x: r.I.x - 40, y: r.I.y + 20 });
  r.applySegMove(s2, -20);
  r.finishSegMove(s2);
  assert.deepEqual(r.seen, ['short? The move']);
});

test('#405 schematic move: a wire\'s kept ends, a wire stretched', () => {
  const P = (...a) => a.map(([x, y]) => ({ x, y }));
  const xy = (pts) => pts.map((p) => [p.x, p.y]);
  // moved as a whole; its first end kept: a jog back to it, square
  assert.deepEqual(xy(keptEnds(P([0, 0], [100, 0]), null, 20, 30)), [[20, 30], [120, 30]]);
  assert.deepEqual(xy(keptEnds(P([0, 0], [100, 0]), { a: true }, 20, 30)), [[0, 0], [0, 30], [120, 30]]);
  assert.deepEqual(xy(keptEnds(P([0, 0], [100, 0]), { a: true, b: true }, 0, 0)), [[0, 0], [100, 0]]);
  // stretched from its first end: along its segment, across with a jog in the middle, both ends: moved
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0]), true, false, 20, 0)), [[20, 0], [100, 0]]);
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0]), true, false, 0, 40)), [[0, 40], [50, 40], [50, 0], [100, 0]]);
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0]), true, true, 10, 10)), [[10, 10], [110, 10]]);
  // from its last end: the same, mirrored
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0]), false, true, 0, 40)), [[0, 0], [50, 0], [50, 40], [100, 40]]);
  // a T-junction on its first segment: kept, a jog near the end instead
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0], [100, 100]), true, false, 0, 40, P([50, 0]))), [[0, 40], [10, 40], [10, 0], [100, 0], [100, 100]]);
  // with three points and nothing on it: the first segment moved with its end
  assert.deepEqual(xy(rubber(P([0, 0], [100, 0], [100, 100]), true, false, 0, 40)), [[0, 40], [100, 40], [100, 100]]);
});
