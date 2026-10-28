// The wires an ISE schematic export adds from a library symbol's pin to the Silinx pin (core/isesch-route.js, #1798):
// routed on the grid around the sheet's wires, pins and names of the other nets: never along another net's wire, never
// ending or turning on it, nor over its points; crossing it is allowed; then in the way of the next ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOrigin, placeBlock, routeStubs, stubRouter } from '../core/isesch-route.js';

const A = { name: 'a' }, B = { name: 'b' }, C = { name: 'c' };
// the pieces of a path, and whether any lies along, ends or turns on one of the segments of another net
const pieces = pts => pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]]);
const on = (x, y, [x1, y1, x2, y2]) => x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
const along = (a, b) => (a[1] === a[3] && b[1] === b[3] && a[1] === b[1] && Math.min(Math.max(a[0], a[2]), Math.max(b[0], b[2])) > Math.max(Math.min(a[0], a[2]), Math.min(b[0], b[2])))
  || (a[0] === a[2] && b[0] === b[2] && a[0] === b[0] && Math.min(Math.max(a[1], a[3]), Math.max(b[1], b[3])) > Math.max(Math.min(a[1], a[3]), Math.min(b[1], b[3])));

test('#1798 a straight way when it is free; the same point: no wire', () => {
  const R = stubRouter();
  assert.deepEqual(R.route([0, 0], [160, 0], A), [[0, 0], [160, 0]]);
  assert.deepEqual(R.route([0, 0], [96, 64], A).length, 3);   // one bend
  assert.deepEqual(R.route([32, 32], [32, 32], A), [[32, 32]]);
  assert.equal(R.route([0, 8], [32, 32], A), null);           // (off the grid)
});

test('#1798 around another net\'s wire along the way; across one that crosses it', () => {
  const R = stubRouter();
  R.addSeg(B, 32, 0, 128, 0);                                // along P-T: a way around it
  R.addSeg(C, 64, -64, 64, -32);                             // (its end on the way around above: not there)
  const p = R.route([0, 0], [160, 0], A);
  assert.ok(p.length > 2, JSON.stringify(p));
  for (const s of pieces(p)) {
    assert.ok(!along(s, [32, 0, 128, 0]), JSON.stringify(p));
    assert.ok(!on(64, -64, s) && !on(64, -32, s), JSON.stringify(p));
  }
  for (const [x, y] of p.slice(1, -1)) assert.ok(!on(x, y, [32, 0, 128, 0]) && !on(x, y, [64, -64, 64, -32]), 'no turn on another net\'s wire');
  // a wire across the straight way: crossed
  const R2 = stubRouter();
  R2.addSeg(B, 80, -64, 80, 64);
  assert.deepEqual(R2.route([0, 0], [160, 0], A), [[0, 0], [160, 0]]);
  // its own net's wire: no obstacle
  const R3 = stubRouter();
  R3.addSeg(A, 32, 0, 128, 0);
  assert.deepEqual(R3.route([0, 0], [160, 0], A), [[0, 0], [160, 0]]);
});

test('#1798 never over another net\'s point (a pin, a name); an unconnected pin is in every net\'s way', () => {
  const R = stubRouter();
  R.addPoint(B, 64, 0);
  R.addPoint(null, 96, 0);
  const p = R.route([0, 0], [160, 0], A);
  for (const s of pieces(p)) assert.ok(!on(64, 0, s) && !on(96, 0, s), JSON.stringify(p));
  assert.equal(R.blocked(96, 0, A), true);
  assert.equal(R.blocked(64, 0, B), false);
  assert.equal(R.blocked(64, 0, A), true);
  // shut in by points (a wire is crossed): no way
  const W = stubRouter();
  for (const [x, y] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) W.addPoint(B, x, y);
  assert.equal(W.route([0, 0], [160, 0], A), null);
});

test('#1798 a block\'s origin: the best where none of its pins is on another net\'s wire or point, else one near it', () => {
  const R = stubRouter();
  R.addSeg(B, 0, 0, 0, 320);
  const pins = [[0, 0, A], [0, 64, null]];
  assert.deepEqual(pickOrigin(R, [[0, 0], [320, 0]], pins), [320, 0]);
  assert.deepEqual(pickOrigin(R, [[0, 0]], pins), [-32, -32]);
  // the pins placed: in the next ones' way
  placeBlock(R, [320, 0], pins);
  assert.equal(R.blocked(320, 64, A), true);
  assert.equal(R.blocked(320, 0, A), false);
  assert.equal(R.blocked(320, 0, C), true);
});

test('#1798 several wires: the shortest first, the others around it; no two along each other', () => {
  const R = stubRouter();
  const got = new Map();
  // three pins at x 0 to three points at x 192, in the reverse order: their straight L's would share x 192
  const stubs = [{ net: A, P: [0, 0], T: [192, 128] }, { net: B, P: [0, 64], T: [192, 64] }, { net: C, P: [0, 128], T: [192, 0] }];
  for (const s of stubs) { R.addPoint(s.net, ...s.P); R.addPoint(s.net, ...s.T); }
  routeStubs(R, stubs, (net, seg) => { got.set(net, [...(got.get(net) || []), seg]); R.addSeg(net, ...seg); });
  assert.deepEqual(got.get(B), [[0, 64, 192, 64]]);
  const all = [...got].flatMap(([n, l]) => l.map(s => [n, s]));
  for (const [n, s] of all) for (const [m, t] of all) if (n !== m) {
    assert.ok(!along(s, t), `${n.name} along ${m.name}`);
    assert.ok(!on(s[0], s[1], t) && !on(s[2], s[3], t), `${n.name} ends on ${m.name}`);
  }
  // (no way: across then along, as before)
  const W = stubRouter();
  for (const [x, y] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) W.addPoint(B, x, y);
  const segs = [];
  routeStubs(W, [{ net: A, P: [0, 0], T: [160, 64] }], (net, seg) => segs.push(seg));
  assert.deepEqual(segs, [[0, 0, 160, 0], [160, 0, 160, 64]]);
});
