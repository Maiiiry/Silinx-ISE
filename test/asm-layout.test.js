// The layout of an ASM chart recovered from HDL (core/asm-layout.js, #405: out of asm-from-hdl.js): the boxes placed
// top-down on the grid without overlapping, the states in breadth-first order from the initial one, a decision's two
// exits apart; a previous chart's ids and positions reused for the boxes that match, a new box given a fresh id
// clear of the others. asm-from-hdl.js still exports the same functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asmLayout, nodeSize, reusePrevious, exitsOf } from '../core/asm-layout.js';
import * as fromHdl from '../core/asm-from-hdl.js';
import { newModel, normalizeModel } from '../core/asm.js';

const overlap = (a, b) => {
  const A = nodeSize(a), B = nodeSize(b);
  return Math.abs(a.x - b.x) * 2 < A.w + B.w && Math.abs(a.y - b.y) * 2 < A.h + B.h;
};

test('#405 ASM layout: asm-from-hdl.js exports the module\'s functions', () => {
  assert.equal(fromHdl.asmLayout, asmLayout);
  assert.equal(fromHdl.nodeSize, nodeSize);
});

test('#405 ASM layout: on the grid, no overlaps, states in breadth-first order, a decision\'s exits apart', () => {
  const m = newModel('ctl', 'vhdl');
  for (const n of m.nodes) { n.x = 0; n.y = 0; }
  const out = asmLayout(m);
  assert.notEqual(out, m);
  assert.deepEqual(out.nodes.map((n) => n.id), m.nodes.map((n) => n.id));
  for (const n of out.nodes) assert.ok(n.x % 10 === 0 && n.y % 10 === 0, `${n.id} at ${n.x},${n.y}`);
  for (let i = 0; i < out.nodes.length; i++) for (let j = i + 1; j < out.nodes.length; j++) {
    assert.ok(!overlap(out.nodes[i], out.nodes[j]), `${out.nodes[i].id} / ${out.nodes[j].id}`);
  }
  // IDLE, then RUN, then FINISH, top-down
  const y = (id) => out.nodes.find((n) => n.id === id).y;
  assert.ok(y('s1') < y('s2') && y('s2') < y('s3'));
  // a decision's 1 and 0 exits not on top of each other
  const ex = exitsOf(out).get('d2');
  const t = out.nodes.find((n) => n.id === ex.true), f = out.nodes.find((n) => n.id === ex.false);
  assert.ok(t.x !== f.x || t.y !== f.y);
  assert.deepEqual(exitsOf(out).get('s1'), { next: 'd1' });
});

test('#405 ASM layout: a previous chart\'s ids and positions reused, a new box with a fresh id clear of the others', () => {
  const prev = asmLayout(newModel('ctl', 'vhdl'));
  for (const n of prev.nodes) { n.id = `p_${n.id}`; n.x += 100; }
  prev.edges = prev.edges.map((e) => ({ ...e, from: `p_${e.from}`, to: `p_${e.to}` }));
  prev.initial = `p_${prev.initial}`;
  // the same machine, extracted again with other ids, and one more output box between RUN and its decision
  const m = normalizeModel(newModel('ctl', 'vhdl'));
  m.nodes.push({ id: 'o9', type: 'output', x: 0, y: 0, actions: ['load = 1'] });
  m.edges = m.edges.map((e) => (e.id === 'e5' ? { ...e, to: 'o9' } : e));
  m.edges.push({ id: 'e9', from: 'o9', to: 'd2', port: 'next' });
  const out = reusePrevious(m, prev);
  const byName = (name) => out.nodes.find((n) => n.name === name);
  const prevByName = (name) => prev.nodes.find((n) => n.name === name);
  for (const s of ['IDLE', 'RUN', 'FINISH']) {
    assert.equal(byName(s).id, prevByName(s).id, s);
    assert.deepEqual([byName(s).x, byName(s).y], [prevByName(s).x, prevByName(s).y], s);
  }
  // every id unique, the new box's not one of the previous chart's
  const ids = out.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  const added = out.nodes.find((n) => n.actions?.join() === 'load = 1' && !prev.nodes.some((p) => p.id === n.id));
  assert.ok(added, 'the new box');
  // the edges follow the ids
  for (const e of out.edges) assert.ok(ids.includes(e.from) && ids.includes(e.to), JSON.stringify(e));
});
