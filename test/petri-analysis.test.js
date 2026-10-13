// Petri net analysis (core/petri-analysis.js, #188): the reachability graph of the token game, bounds,
// deadlocks and the shortest way to each, liveness, reversibility, P- and T-invariants (Farkas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPetri, normalizePetri } from '../core/petri.js';
import { analyzePetri, incidence, semiflows } from '../core/petri-analysis.js';

const net = (places, transitions, arcs) => normalizePetri({ name: 'n', places: places.map(p => (typeof p === 'string' ? { id: p, name: p } : { name: p.id, ...p })),
  transitions: transitions.map(t => ({ id: t, name: t })), arcs: arcs.map(([from, to, weight = 1, inhibitor = false], i) => ({ id: `a${i}`, from, to, weight, ...(inhibitor ? { inhibitor } : {}) })) });
const summary = a => ({ states: a.states.length, truncated: a.truncated, bounds: a.bounds, safe: a.safe, deadlocks: a.deadlocks, liveness: a.liveness, live: a.live, reversible: a.reversible,
  pInvariants: a.pInvariants, tInvariants: a.tInvariants, conservative: a.conservative, atCapacity: a.atCapacity });

test('a new net: two markings, safe, live, reversible; idle + work = 1; start + done', () => {
  const a = analyzePetri(newPetri('ctl'));
  assert.deepEqual(summary(a), {
    states: 2, truncated: false, bounds: { p1: 1, p2: 1 }, safe: true, deadlocks: [], liveness: { t1: 'live', t2: 'live' }, live: true, reversible: true,
    pInvariants: [{ weights: { p1: 1, p2: 1 }, tokens: 1 }], tInvariants: [{ t1: 1, t2: 1 }], conservative: true, atCapacity: ['p1', 'p2'],
  });
  assert.deepEqual(a.states, [{ marking: { p1: 1, p2: 0 }, succ: [{ transition: 't1', to: 1 }] }, { marking: { p1: 0, p2: 1 }, succ: [{ transition: 't2', to: 0 }] }]);
});

test('two processes taking two resources in opposite orders: the deadlock and the shortest way to it', () => {
  // A: a0 -(r1)-> a1 -(r2)-> a0 (gives both back); B: b0 -(r2)-> b1 -(r1)-> b0
  const m = net([{ id: 'r1', tokens: 1 }, { id: 'r2', tokens: 1 }, { id: 'a0', tokens: 1 }, 'a1', { id: 'b0', tokens: 1 }, 'b1'], ['A1', 'A2', 'B1', 'B2'], [
    ['a0', 'A1'], ['r1', 'A1'], ['A1', 'a1'], ['a1', 'A2'], ['r2', 'A2'], ['A2', 'a0'], ['A2', 'r1'], ['A2', 'r2'],
    ['b0', 'B1'], ['r2', 'B1'], ['B1', 'b1'], ['b1', 'B2'], ['r1', 'B2'], ['B2', 'b0'], ['B2', 'r1'], ['B2', 'r2']]);
  const a = analyzePetri(m);
  assert.deepEqual(summary(a), {
    states: 4, truncated: false, bounds: { r1: 1, r2: 1, a0: 1, a1: 1, b0: 1, b1: 1 }, safe: true,
    deadlocks: [{ marking: { r1: 0, r2: 0, a0: 0, a1: 1, b0: 0, b1: 1 }, path: ['A1', 'B1'] }],
    liveness: { A1: 'fires', A2: 'fires', B1: 'fires', B2: 'fires' }, live: false, reversible: false,
    pInvariants: [{ weights: { r1: 1, a1: 1 }, tokens: 1 }, { weights: { a0: 1, a1: 1 }, tokens: 1 }, { weights: { r2: 1, b1: 1 }, tokens: 1 }, { weights: { b0: 1, b1: 1 }, tokens: 1 }],
    tInvariants: [{ A1: 1, A2: 1 }, { B1: 1, B2: 1 }], conservative: true, atCapacity: ['r1', 'r2', 'a0', 'a1', 'b0', 'b1'],
  });
  assert.equal(a.deadlockCount, 1);
});

test('weights, capacities, an inhibitor arc, a transition that never fires, a source (not conservative)', () => {
  // gen puts 2 into buf (capacity 4); eat takes 1 while stop is empty; never needs 5 tokens of buf (it
  // never fires, but 5 gen + 2 never is a T-invariant all the same: the invariants are of the structure)
  const m = net(['src', { id: 'buf', capacity: 4 }, 'stop'], ['gen', 'eat', 'never'], [['gen', 'buf', 2], ['buf', 'eat'], ['stop', 'eat', 1, true], ['buf', 'never', 5]]);
  const a = analyzePetri(m);
  assert.deepEqual(summary(a), {
    states: 5, truncated: false, bounds: { src: 0, buf: 4, stop: 0 }, safe: false, deadlocks: [],
    liveness: { gen: 'live', eat: 'live', never: 'dead' }, live: false, reversible: true,
    pInvariants: [{ weights: { src: 1 }, tokens: 0 }, { weights: { stop: 1 }, tokens: 0 }], tInvariants: [{ gen: 1, eat: 2 }, { gen: 5, never: 2 }], conservative: false, atCapacity: ['buf'],
  });
  assert.deepEqual(incidence(m), [[0, 0, 0], [2, -1, -5], [0, 0, 0]]);
});

test('the graph stopped at maxStates: partial results, liveness and reversibility unknown', () => {
  const m = net([{ id: 'c', capacity: 255 }], ['inc', 'dec'], [['inc', 'c'], ['c', 'dec']]);
  const a = analyzePetri(m, { maxStates: 10 });
  assert.equal(a.states.length, 10);
  assert.equal(a.truncated, true);
  assert.deepEqual(a.deadlocks, [], 'the last marking explored still has a way on: not a deadlock');
  assert.deepEqual(a.liveness, { inc: 'fires', dec: 'fires' });
  assert.equal(a.reversible, null);
  assert.equal(analyzePetri(m).states.length, 256);
});

test('semiflows: the minimal supports only, scaled to integers', () => {
  // y·A = 0, y >= 0: the minimal ones (a place in no column: a semiflow by itself)
  assert.deepEqual(semiflows([[1, 2], [-1, -2], [0, 0]]), [[0, 0, 1], [1, 1, 0]]);
  assert.deepEqual(semiflows([[2], [-1], [-1]]), [[1, 2, 0], [1, 0, 2]]);
  assert.deepEqual(semiflows([[1], [1]]), []);
});
