// web/js/doc-cursor.js (#1299): each source's cursor kept per project, in this edition's own key.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }, configurable: true, writable: true });
const { keepCursor, keptCursor } = await import('../web/js/doc-cursor.js');

test('keepCursor / keptCursor: per project and source; the last one kept', () => {
  mem.clear();
  assert.equal(keptCursor('A', 'src/top.vhd'), null);
  keepCursor('A', 'src/top.vhd', { line: 20, ch: 3 });
  keepCursor('A', 'src/top.vhd', { line: 21, ch: 0 });
  keepCursor('B', 'src/top.vhd', { line: 5, ch: 1 });
  assert.deepEqual(keptCursor('A', 'src/top.vhd'), { line: 21, ch: 0 });
  assert.deepEqual(keptCursor('B', 'src/top.vhd'), { line: 5, ch: 1 });
  assert.equal(keptCursor('A', 'src/other.v'), null);
  assert.deepEqual([...mem.keys()].sort(), ['silinx.cursor.A', 'silinx.cursor.B']);
});

test('keepCursor: at most 50 sources a project, the ones moved in last', () => {
  mem.clear();
  for (let i = 0; i < 55; i++) keepCursor('P', `f${i}.v`, { line: i, ch: 0 });
  keepCursor('P', 'f0.v', { line: 99, ch: 0 });   // (moved in again: kept, the oldest others dropped)
  const m = JSON.parse(mem.get('silinx.cursor.P'));
  assert.equal(Object.keys(m).length, 50);
  assert.deepEqual(keptCursor('P', 'f0.v'), { line: 99, ch: 0 });
  assert.equal(keptCursor('P', 'f5.v'), null);
  assert.deepEqual(keptCursor('P', 'f54.v'), { line: 54, ch: 0 });
});

test('keptCursor: a bad or missing value is none; keepCursor ignores no project, path or position', () => {
  mem.clear();
  mem.set('silinx.cursor.X', '{"a.v":{"line":-1,"ch":0},"b.v":{"line":"2","ch":0},"c.v":7}');
  for (const p of ['a.v', 'b.v', 'c.v']) assert.equal(keptCursor('X', p), null, p);
  mem.set('silinx.cursor.Y', 'not json');
  assert.equal(keptCursor('Y', 'a.v'), null);
  keepCursor('', 'a.v', { line: 1, ch: 1 }); keepCursor('Z', '', { line: 1, ch: 1 }); keepCursor('Z', 'a.v', null);
  assert.equal(mem.has('silinx.cursor.') || mem.has('silinx.cursor.Z'), false);
});
