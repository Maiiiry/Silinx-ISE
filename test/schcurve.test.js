// Curved wires (#1144, core/schcurve.js): a wire's own curve stored relative to its ends (it follows them), the curve
// derived from a rectilinear path, the cubic Béziers through the knots, the point of a curve nearest a point (hit-
// testing) and the point of the path answering it, a wire split with its curve shared, a stroke simplified; saved and
// read again (older files, bad curves); a curve a drawing only: the netlist, Check Schematic, the generated VHDL and
// Verilog and ISE's .sch the same with the schematic drawn with curves, for the gates example and every module of
// every example converted to a schematic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../core/schcurve.js';
import { normalizeDoc, newDoc, netlist, generateHdl, splitWiresAt, modulesFromLibrary } from '../core/schdoc.js';
import { exportIseSch } from '../core/isesch-export.js';
import { copySchematic, pasteSchematic } from '../core/schclip.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { compile } from '../core/compile.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const P = (x, y) => ({ x, y });
const near = (a, b, tol = 0.11) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const bez = ([p0, c1, c2, p3], t) => { const s = 1 - t; return P(s ** 3 * p0.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t ** 3 * p3.x, s ** 3 * p0.y + 3 * s * s * t * c1.y + 3 * s * t * t * c2.y + t ** 3 * p3.y); };

test('a point relative to the ends and back: the fraction along them, the distance to their left; ends at one point', () => {
  const a = P(100, 100), b = P(300, 100);
  assert.deepEqual(C.toRel(P(200, 60), a, b), { u: 0.5, v: -40 });
  assert.deepEqual(C.toAbs({ u: 0.5, v: -40 }, a, b), P(200, 60));
  // turned a quarter: the same point relative to the turned ends turns with them
  assert.deepEqual(C.toAbs({ u: 0.5, v: -40 }, P(100, 100), P(100, 300)), P(140, 200));
  // a random point, any ends: back where it was (to 0.1 px)
  for (let i = 0; i < 50; i++) {
    const p = P(Math.random() * 900, Math.random() * 900), e0 = P(Math.random() * 900, Math.random() * 900), e1 = P(Math.random() * 900, Math.random() * 900);
    assert.ok(near(C.toAbs(C.toRel(p, e0, e1), e0, e1), p, 0.2), JSON.stringify([p, e0, e1]));
  }
  // (both ends at one point: offsets from it)
  assert.deepEqual(C.toRel(P(130, 90), a, a), { u: 30, v: -10 });
  assert.deepEqual(C.toAbs({ u: 30, v: -10 }, a, a), P(130, 90));
});

test('the derived curve: a straight wire stays straight; a bend rounded, the wire leaving its ends along its segments', () => {
  assert.equal(C.curveD({ points: [P(0, 0), P(100, 0)] }), 'M0,0 L100,0');
  const L = { points: [P(0, 0), P(100, 0), P(100, 100)] };
  assert.deepEqual(C.derivedKnots(L.points), [P(75, 25)]);
  assert.equal(C.curveD(L), 'M0,0 C26.4,0 58.3,8.3 75,25 C91.7,41.7 100,73.6 100,100');
  const B = C.curveBeziers(L);
  assert.equal(B[0][1].y, 0, 'leaving the first end horizontally');
  assert.equal(B[1][2].x, 100, 'reaching the last end vertically');
  // a Z: one knot per bend, the middle of its rounding
  assert.deepEqual(C.derivedKnots([P(0, 0), P(100, 0), P(100, 100), P(200, 100)]), [P(75, 12.5), P(125, 87.5)]);
  // the curve stays inside the path's box (no overshoot beyond a fraction of a pixel)
  for (const p of C.sampleCurve({ points: [P(0, 0), P(100, 0), P(100, 100), P(200, 100)] })) assert.ok(p.x >= -0.5 && p.x <= 200.5 && p.y >= -0.5 && p.y <= 100.5, JSON.stringify(p));
});

test('a wire\'s own curve: through its knots, smooth (C1) at each, [] a straight line; it follows its ends', () => {
  const w = { points: [P(0, 0), P(200, 0), P(200, 100)] };
  C.setCurve(w, [P(50, -40), P(150, 80)]);
  // (relative to its ends (0, 0) and (200, 100))
  assert.deepEqual(w.curve, [C.toRel(P(50, -40), P(0, 0), P(200, 100)), C.toRel(P(150, 80), P(0, 0), P(200, 100))]);
  assert.deepEqual(C.curveAbs(w), [P(50, -40), P(150, 80)]);
  const B = C.curveBeziers(w);
  assert.equal(B.length, 3);
  assert.deepEqual([B[0][0], B[0][3], B[1][3], B[2][3]], [P(0, 0), P(50, -40), P(150, 80), P(200, 100)], 'through its knots');
  for (let i = 0; i + 1 < B.length; i++) {
    const t1 = P(B[i][3].x - B[i][2].x, B[i][3].y - B[i][2].y), t2 = P(B[i + 1][1].x - B[i + 1][0].x, B[i + 1][1].y - B[i + 1][0].y);
    assert.ok(near(t1, t2, 1e-9), `the same tangent on both sides of knot ${i + 1}`);
  }
  assert.equal(C.curveD(w).startsWith('M0,0 C'), true);
  assert.equal(C.curveD(C.setCurve({ points: [P(0, 0), P(100, 0), P(100, 50)] }, [])), 'M0,0 C33.3,16.7 66.7,33.3 100,50', '[]: straight between the ends');
  // the path rerouted, its ends kept: the curve the same
  const d0 = C.curveD(w);
  w.points = [P(0, 0), P(0, 100), P(200, 100)];
  assert.equal(C.curveD(w), d0);
  // both ends moved by (30, 20) (the wire moved): every knot moved with them
  w.points = [P(30, 20), P(230, 20), P(230, 120)];
  assert.deepEqual(C.curveAbs(w), [P(80, -20), P(180, 100)]);
  // one end moved: the knots near it move most, the shape kept to its side
  w.points = [P(30, 20), P(230, 20), P(230, 220)];
  const K = C.curveAbs(w);
  assert.ok(K[0].y < 20 && K[1].y > K[0].y);
  assert.equal(C.setCurve(w, null).curve, undefined, 'dropped');
});

test('hit-testing: the point of a curve nearest a point, its distance, and the grid point of the path answering it', () => {
  const w = { points: [P(0, 0), P(200, 0), P(200, 100)] };
  C.setCurve(w, [P(100, -60)]);
  const n = C.curveNearest(w, P(100, -50));
  assert.ok(n.d <= 10 && n.d >= 5, `${n.d}`);
  assert.ok(Math.abs(n.f - 0.4) < 0.1, `${n.f}`);
  assert.ok(C.curveNearest(w, P(100, 0)).d > 40, 'the path itself far from the curve');
  // the point of the path at the same fraction, on the grid, on the path
  const q = C.curveToPath(w, P(100, -50));
  assert.ok(q.y === 0 && q.x % 10 === 0 && q.x > 60 && q.x < 140, JSON.stringify(q));
  assert.deepEqual(C.curveToPath(w, P(0, 0)), P(0, 0), 'its first end');
  assert.deepEqual(C.curveToPath(w, P(200, 100)), P(200, 100), 'its last end');
  assert.deepEqual(C.pathPointAt(w, 0.5), P(150, 0));
  assert.equal(C.pathFraction(w, P(200, 50)), 250 / 300);
  assert.ok(near(C.curvePointAt(w, 0), P(0, 0)) && near(C.curvePointAt(w, 1), P(200, 100)));
});

test('a wire with its own curve split (#678): each knot to the piece whose part of the curve it is on, where it was', () => {
  const doc = newDoc();
  const w = C.setCurve({ id: 'W1', points: [P(0, 0), P(200, 0), P(200, 200)] }, [P(60, -50), P(260, 150)]);
  doc.wires.push(w);
  const added = splitWiresAt(doc, [P(200, 0)]);
  assert.deepEqual(added, [{ id: 'W2', from: 'W1' }]);
  const [a, b] = doc.wires;
  assert.deepEqual(a.points, [P(0, 0), P(200, 0)]);
  assert.deepEqual(b.points, [P(200, 0), P(200, 200)]);
  assert.deepEqual(C.curveAbs(a), [P(60, -50)]);
  assert.deepEqual(C.curveAbs(b), [P(260, 150)]);
  // a wire with no curve of its own split: none for its pieces
  const d2 = newDoc();
  d2.wires.push({ id: 'W1', points: [P(0, 0), P(200, 0)] });
  splitWiresAt(d2, [P(100, 0)]);
  assert.deepEqual(d2.wires.map(x => 'curve' in x), [false, false]);
});

test('a stroke simplified: its ends kept, the points within the tolerance of a line dropped', () => {
  assert.deepEqual(C.simplify([P(0, 0), P(5, 0.5), P(10, 0), P(10, 10)], 1), [P(0, 0), P(10, 0), P(10, 10)]);
  const arc = Array.from({ length: 41 }, (_, i) => P(100 * Math.cos(i * Math.PI / 40), 100 * Math.sin(i * Math.PI / 40)));
  const s = C.simplify(arc, 2);
  assert.ok(s.length >= 5 && s.length <= 12, `${s.length}`);
  assert.deepEqual([s[0], s.at(-1)], [P(100, 0), P(-100, 0)]);
  assert.deepEqual(C.simplify([P(1, 2)], 1), [P(1, 2)]);
});

test('saved and read again: the style and the curves kept; an older file, a bad curve or style read as rectilinear', () => {
  const doc = newDoc('c', 'vhdl');
  doc.wireStyle = 'curved';
  doc.wires.push({ id: 'W1', points: [P(0, 0), P(100, 0)], curve: [{ u: 0.5, v: -20 }] }, { id: 'W2', points: [P(0, 10), P(100, 10)], curve: [] });
  const back = normalizeDoc(JSON.parse(JSON.stringify(doc)));
  assert.equal(back.wireStyle, 'curved');
  assert.deepEqual(back.wires.map(w => w.curve), [[{ u: 0.5, v: -20 }], []]);
  assert.deepEqual(normalizeDoc(back), back, 'stable');
  // an older file: no style, no curves; nothing added
  const old = normalizeDoc({ name: 'o', wires: [{ id: 'W1', points: [P(0, 0), P(100, 0)] }] });
  assert.equal('wireStyle' in old, false);
  assert.equal('curve' in old.wires[0], false);
  // bad ones: dropped
  const bad = normalizeDoc({ wireStyle: 'wavy', wires: [{ points: [P(0, 0), P(100, 0)], curve: 'x' }, { points: [P(0, 0), P(0, 100)], curve: [{ u: 'a' }] }, { points: [P(0, 0), P(10, 10)], curve: [{ u: 0.5, v: 3 }, null] }] });
  assert.equal('wireStyle' in bad, false);
  assert.deepEqual(bad.wires.map(w => w.curve), [undefined, undefined, [{ u: 0.5, v: 3 }]]);
  // (no more than MAX_KNOTS knots)
  assert.equal(normalizeDoc({ wires: [{ points: [P(0, 0), P(10, 0)], curve: Array.from({ length: 99 }, (_, i) => ({ u: i / 99, v: 1 })) }] }).wires[0].curve.length, C.MAX_KNOTS);
});

test('copied and pasted (#677): a wire\'s curve with it, moved with the wire', () => {
  const doc = newDoc();
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 300, y: 100 });
  doc.wires.push(C.setCurve({ id: 'W1', points: [P(100, 100), P(300, 100)] }, [P(200, 40)]));
  const clip = copySchematic(doc, { ports: ['P1', 'P2'], wires: ['W1'] });
  const { ids } = pasteSchematic(doc, clip, { dx: 40, dy: 40 });
  const w = doc.wires.find(x => x.id === ids.wires[0]);
  assert.deepEqual(w.points, [P(140, 140), P(340, 140)]);
  assert.deepEqual(C.curveAbs(w), [P(240, 80)]);
});

test('hop-overs on curves (#1163): two curves crossing, the flatter hops; none at a wire\'s end, a T or a shared end', () => {
  // W1 a bow from (0, 100) to (200, 100) through (100, 70); W2 straight down x = 100: they cross at (100, 70)
  const W1 = C.setCurve({ id: 'W1', points: [P(0, 100), P(200, 100)] }, [P(100, 70)]), W2 = { id: 'W2', points: [P(100, 0), P(100, 200)] };
  const x = C.curveCrossings({ wires: [W1, W2] });
  assert.equal(x.length, 1);
  assert.equal(x[0].wire, 'W1', 'the flatter one hops');
  assert.ok(near(x[0], P(100, 70), 0.6), JSON.stringify(x[0]));
  // its path: from its first end to its last, one arc of the hop's radius, up (left to right), around the crossing
  const d = C.curveHopD(W1, [x[0].s]);
  assert.ok(d.startsWith('M0,100 L') && d.endsWith(' L200,100'), d);
  const arcs = [...d.matchAll(/L([\d.]+),([\d.]+) A5,5 0 0 (\d) ([\d.]+),([\d.]+)/g)];
  assert.equal(arcs.length, 1, d);
  const [, ax, ay, sweep, bx, by] = arcs[0].map(Number);
  assert.equal(sweep, 1);
  assert.ok(Math.abs(ax - 95) < 0.6 && Math.abs(bx - 105) < 0.6 && Math.abs(ay - 70.2) < 1 && Math.abs(by - 70.2) < 1, arcs[0][0]);
  // the same wire drawn right to left: the arc's sweep the other way (still up)
  const back = C.setCurve({ id: 'W1', points: [P(200, 100), P(0, 100)] }, [P(100, 70)]);
  assert.match(C.curveHopD(back, C.curveCrossings({ wires: [back, W2] }).map(c => c.s)), / A5,5 0 0 0 /);
  // no hop: a curve ended on another's middle (a T), two wires with a shared end, curves apart
  const T = { id: 'W3', points: [P(100, 300), P(100, 400)] }, base = C.setCurve({ id: 'W4', points: [P(0, 300), P(200, 300)] }, [P(100, 300)]);
  assert.deepEqual(C.curveCrossings({ wires: [base, T] }), [], 'a T');
  assert.deepEqual(C.curveCrossings({ wires: [{ id: 'A', points: [P(0, 0), P(100, 100)] }, { id: 'B', points: [P(100, 100), P(0, 200)] }] }), [], 'a shared end');
  assert.deepEqual(C.curveCrossings({ wires: [W1, { id: 'F', points: [P(300, 0), P(300, 200)] }] }), [], 'apart');
  // a curve crossing two others: two hops; two crossings closer than a hop: the second left out
  const W5 = { id: 'W5', points: [P(120, 0), P(120, 200)] };
  const two = C.curveCrossings({ wires: [W1, W2, W5] }).filter(c => c.wire === 'W1');
  assert.equal(two.length, 2);
  assert.equal([...C.curveHopD(W1, two.map(c => c.s)).matchAll(/ A5,5 /g)].length, 2);
  assert.equal([...C.curveHopD(W1, [100, 104]).matchAll(/ A5,5 /g)].length, 1, 'overlapping hops: one');
  // the plain curve where there is no hop
  assert.equal(C.curveHopD(W1, []).includes(' A'), false);
});

// ------------------------------------------------------------------ a drawing only: the same netlist, HDL and .sch
// the document drawn with curves: the style ticked, every wire a curve of its own (a wave of a few knots)
function curvedCopy(doc) {
  const d = JSON.parse(JSON.stringify(doc));
  d.wireStyle = 'curved';
  d.wires.forEach((w, k) => {
    const a = w.points[0], b = w.points.at(-1);
    if (k % 3 === 2) return;                         // (some with the derived curve)
    C.setCurve(w, k % 3 ? [] : [0.25, 0.5, 0.75].map((t, i) => P(a.x + (b.x - a.x) * t + 13 * (i - 1), a.y + (b.y - a.y) * t + (i % 2 ? 37 : -23))));
  });
  return normalizeDoc(d);
}
const nlView = nl => ({ nets: nl.nets, wireNet: [...nl.wireNet].map(([k, n]) => [k, n.id]), junctions: nl.junctions, diagnostics: nl.diagnostics });
function sameEitherWay(doc, modules, what) {
  const cv = curvedCopy(doc);
  assert.ok(cv.wires.some(w => w.curve?.length), `${what}: curves drawn`);
  assert.deepEqual(nlView(netlist(cv, { modules })), nlView(netlist(doc, { modules })), `${what}: the netlist and Check Schematic's messages`);
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(cv, { lang, modules }), generateHdl(doc, { lang, modules }), `${what}: the ${lang}`);
  const ise = d => exportIseSch(d, { modules, timestamp: '2026-10-24T12:00:00' });
  assert.deepEqual(ise(cv), ise(doc), `${what}: ISE's .sch`);
}

test('the gates example drawn with curves: its netlist (no message), VHDL, Verilog and ISE .sch the same', () => {
  const ex = example('gates');
  const doc = normalizeDoc(JSON.parse(fs.readFileSync(path.join(ex.dir, 'src/gates.sch.json'), 'utf8')));
  assert.deepEqual(netlist(curvedCopy(doc)).diagnostics, [], 'no warnings');
  sameEitherWay(doc, {}, 'gates');
});

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
for (const name of EXAMPLES) {
  test(`every module of the example ${name} as a schematic, drawn with curves: the same netlist, HDL and ISE .sch`, async () => {
    const ex = example(name);
    const lib = compile(ex.sources);
    const modules = modulesFromLibrary(lib, { sources: ex.sources });
    const files = new Set(ex.sources.map(s => s.path));
    let n = 0;
    for (const m of lib.modules.values()) {
      if (!files.has(m.archFile || m.file)) continue;
      const r = await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout: g => elk.layout(g) });
      if (!r.doc.wires.length) continue;
      sameEitherWay(normalizeDoc(r.doc, { modules }), modules, `${name}/${m.name}`);
      n++;
    }
    assert.ok(n >= 1, `${name}: schematics with wires`);
  });
}
