// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #692: the hop-overs of a schematic, where two wires cross without connecting (wireCrossings): a
// horizontal segment and a vertical one crossing inside both; not a T-junction, a bend or a wire's end
// on the other one. A view only: the nets and the HDL do not depend on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, netlist, wireCrossings, splitWiresAt } from '../core/schdoc.js';

const P = (x, y) => ({ x, y });
const doc = (...wires) => { const d = newDoc('hops', 'vhdl'); wires.forEach((points, k) => d.wires.push({ id: `W${k + 1}`, points })); return d; };

test('#692 wireCrossings: a horizontal over a vertical segment, crossing inside both', () => {
  // a plus: W1 horizontal, W2 vertical through its middle
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(200, 100)], [P(100, 0), P(100, 200)])), [{ x: 100, y: 100, wire: 'W1', seg: 0 }]);
  // the horizontal hops, whichever wire comes first; a wire's later segment
  assert.deepEqual(wireCrossings(doc([P(100, 0), P(100, 200)], [P(0, 50), P(50, 50), P(50, 100), P(200, 100)])), [{ x: 100, y: 100, wire: 'W2', seg: 2 }]);
  // a wire crossing itself
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(200, 100), P(200, 200), P(100, 200), P(100, 0)])), [{ x: 100, y: 100, wire: 'W1', seg: 0 }]);
  // one horizontal over two verticals
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(300, 100)], [P(100, 0), P(100, 200)], [P(200, 0), P(200, 200)])).map(c => c.x), [100, 200]);
});

test('#692 no hop: a T-junction, a wire\'s end or bend on the other, parallel or apart segments', () => {
  // a T: W2 ends on W1 (split there, as the editor does): a joint, a dot, not a crossing
  const t = doc([P(0, 100), P(200, 100)], [P(100, 200), P(100, 100)]);
  splitWiresAt(t, [P(100, 100)]);
  assert.deepEqual(wireCrossings(t), []);
  assert.deepEqual(netlist(t).junctions, [{ x: 100, y: 100 }]);
  // a wire's end on the other's segment, not split: no connection, and no hop either (it touches, it does not cross)
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(200, 100)], [P(100, 200), P(100, 100)])), []);
  // corners meeting (a bend of each at the same point), an end at a bend
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(100, 100), P(100, 200)], [P(100, 0), P(100, 100), P(200, 100)])), []);
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(100, 100), P(100, 200)], [P(100, 0), P(100, 100)])), []);
  // parallel (overlapping or not), apart, diagonal
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(200, 100)], [P(50, 100), P(150, 100)], [P(0, 120), P(200, 120)])), []);
  assert.deepEqual(wireCrossings(doc([P(0, 100), P(50, 100)], [P(100, 0), P(100, 200)])), []);
  assert.deepEqual(wireCrossings(doc([P(0, 0), P(200, 200)], [P(100, 0), P(100, 200)])), []);
});

test('#692 a crossing is not a connection: the two wires are two nets, no junction dot', () => {
  const d = doc([P(0, 100), P(200, 100)], [P(100, 0), P(100, 200)]);
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 0, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 200, y: 100 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 100, y: 0 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 100, y: 200 });
  const nl = netlist(d);
  assert.notEqual(nl.wireNet.get('W1'), nl.wireNet.get('W2'));
  assert.deepEqual(nl.junctions, []);
  assert.equal(wireCrossings(d).length, 1);
});
