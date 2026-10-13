// Analysis of a Petri net (#188): the reachability graph of the token game, the bounds of the places
// (safe, k-bounded: the width of each place's register), deadlocks (with the shortest firing sequence
// that reaches each), liveness of the transitions, reversibility, and the P- and T-invariants.
//
// The token game ignores the guards: a transition may fire whenever its tokens are there, whatever the
// inputs (the reachable markings of the hardware are among these). The capacities of the places hold
// (core/petri.js isEnabled), so the graph is finite; it is explored up to `maxStates` markings.
import { normalizePetri, preset, postset } from './petri.js';

export const MAX_STATES = 20000;

/** The incidence matrix: C[p][t] = tokens put − tokens taken (inhibitor arcs take none). */
export function incidence(model) {
  const m = normalizePetri(model);
  const C = m.places.map(() => m.transitions.map(() => 0));
  const pi = new Map(m.places.map((p, i) => [p.id, i]));
  m.transitions.forEach((t, j) => {
    for (const a of preset(m, t.id)) if (!a.inhibitor) C[pi.get(a.place)][j] -= a.weight;
    for (const a of postset(m, t.id)) C[pi.get(a.place)][j] += a.weight;
  });
  return C;
}

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
/**
 * The minimal semi-positive solutions y >= 0 of y·A = 0 (A: rows × cols), by the Farkas algorithm
 * (Martinez and Silva): [A | I], each column of A cancelled by combining the rows of opposite signs,
 * then the solutions of minimal support kept. Gives up (null) past `limit` rows.
 */
export function semiflows(A, limit = 5000) {
  const n = A.length, k = n ? A[0].length : 0;
  let rows = A.map((r, i) => ({ a: r.slice(), y: Array.from({ length: n }, (_, j) => (j === i ? 1 : 0)) }));
  for (let j = 0; j < k; j++) {
    const keep = rows.filter(r => r.a[j] === 0), pos = rows.filter(r => r.a[j] > 0), neg = rows.filter(r => r.a[j] < 0);
    const made = [];
    for (const p of pos) for (const q of neg) {
      const fp = -q.a[j], fq = p.a[j];
      const a = p.a.map((v, i) => fp * v + fq * q.a[i]), y = p.y.map((v, i) => fp * v + fq * q.y[i]);
      const g = [...a, ...y].reduce(gcd, 0) || 1;
      made.push({ a: a.map(v => v / g), y: y.map(v => v / g) });
      if (keep.length + made.length > limit) return null;
    }
    rows = [...keep, ...made];
    // the supports that contain another one's are not minimal
    const sup = rows.map(r => r.y.map(v => v !== 0));
    rows = rows.filter((r, i) => !rows.some((s, j) => j !== i && sup[j].every((b, x) => !b || sup[i][x]) && (sup[j].some((b, x) => b !== sup[i][x]) || j < i)));
  }
  return rows.map(r => r.y);
}

/** The analysis: see the head of this file. */
export function analyzePetri(model, { maxStates = MAX_STATES } = {}) {
  const m = normalizePetri(model);
  const P = m.places, T = m.transitions;
  const pi = new Map(P.map((p, i) => [p.id, i]));
  const cap = P.map(p => p.capacity);
  // each transition: what it needs (tokens, inhibitors) and what it changes
  const tr = T.map(t => {
    const pre = preset(m, t.id), post = postset(m, t.id);
    const delta = P.map(() => 0);
    for (const a of pre) if (!a.inhibitor) delta[pi.get(a.place)] -= a.weight;
    for (const a of post) delta[pi.get(a.place)] += a.weight;
    return {
      need: pre.filter(a => !a.inhibitor).map(a => [pi.get(a.place), a.weight]),
      inhib: pre.filter(a => a.inhibitor).map(a => [pi.get(a.place), a.weight]),
      fill: post.map(a => pi.get(a.place)), delta,
    };
  });
  const enabled = (M, j) => {
    const t = tr[j];
    if (t.need.some(([p, w]) => M[p] < w) || t.inhib.some(([p, w]) => M[p] >= w)) return false;
    return t.fill.every(p => M[p] + t.delta[p] <= cap[p]);
  };
  // breadth first: the shortest firing sequences
  const M0 = P.map(p => p.tokens);
  const index = new Map([[M0.join(','), 0]]);
  const states = [{ m: M0, succ: [], parent: -1, by: -1 }];
  let truncated = false;
  for (let s = 0; s < states.length; s++) {
    const M = states[s].m;
    for (let j = 0; j < T.length; j++) {
      if (!enabled(M, j)) continue;
      const N = M.map((v, p) => v + tr[j].delta[p]);
      const key = N.join(',');
      let to = index.get(key);
      if (to === undefined) {
        if (states.length >= maxStates) { truncated = true; continue; }
        to = states.length; index.set(key, to); states.push({ m: N, succ: [], parent: s, by: j });
      }
      states[s].succ.push([j, to]);
    }
  }
  const pathTo = s => { const seq = []; for (; states[s].parent >= 0; s = states[s].parent) seq.unshift(T[states[s].by].id); return seq; };
  const marking = M => Object.fromEntries(P.map((p, i) => [p.id, M[i]]));

  // bounds: the most tokens each place holds
  const bound = P.map((_, i) => Math.max(...states.map(s => s.m[i])));
  // deadlocks: no transition can fire (the first few, with how to get there)
  const deadStates = states.map((s, i) => i).filter(i => !states[i].succ.length && !(truncated && hasUnexplored(i)));
  function hasUnexplored(i) { return T.some((_, j) => enabled(states[i].m, j)); }
  const deadlocks = deadStates.slice(0, 20).map(i => ({ marking: marking(states[i].m), path: pathTo(i) }));
  // the transitions that never fire, those that fire; live ones: in every terminal strongly connected component
  const fires = T.map(() => false);
  for (const s of states) for (const [j] of s.succ) fires[j] = true;
  const scc = tarjan(states.map(s => s.succ.map(([, to]) => to)));
  const terminal = new Set(scc.comps.map((c, k) => k).filter(k => scc.comps[k].every(s => states[s].succ.every(([, to]) => scc.of[to] === k))));
  const liveness = T.map((t, j) => {
    if (!fires[j]) return 'dead';
    if (truncated) return 'fires';
    const live = [...terminal].every(k => scc.comps[k].some(s => states[s].succ.some(([jj, to]) => jj === j && scc.of[to] === k)));
    return live ? 'live' : 'fires';
  });
  // reversible: the initial marking is reachable from every marking (a single terminal component, with it)
  const reversible = truncated ? null : terminal.size === 1 && terminal.has(scc.of[0]) && scc.comps[scc.of[0]].length === states.length;
  // the invariants
  const C = incidence(m);
  const pinv = semiflows(C), tinv = semiflows(T.map((_, j) => P.map((__, i) => C[i][j])));
  const named = (y, list) => Object.fromEntries(list.map((x, i) => [x.id, y[i]]).filter(([, v]) => v));
  const pInvariants = pinv && pinv.map(y => ({ weights: named(y, P), tokens: y.reduce((s, v, i) => s + v * M0[i], 0) }));
  const tInvariants = tinv && tinv.map(x => named(x, T));
  const covered = pinv ? P.every((_, i) => pinv.some(y => y[i] > 0)) : false;
  return {
    states: states.map(s => ({ marking: marking(s.m), succ: s.succ.map(([j, to]) => ({ transition: T[j].id, to })) })),
    truncated, maxStates,
    bounds: Object.fromEntries(P.map((p, i) => [p.id, bound[i]])),
    safe: bound.every(b => b <= 1),
    atCapacity: P.filter((p, i) => bound[i] >= p.capacity).map(p => p.id),   // full at some marking: a capacity may hold back a transition
    deadlocks, deadlockCount: deadStates.length,
    liveness: Object.fromEntries(T.map((t, j) => [t.id, liveness[j]])),
    live: !truncated && liveness.every(l => l === 'live'),
    reversible,
    pInvariants, tInvariants,
    conservative: covered,
  };
}

/** Strongly connected components (iterative Tarjan): { comps: [[states]], of: [component of each state] }. */
function tarjan(adj) {
  const n = adj.length, idx = new Array(n).fill(-1), low = new Array(n).fill(0), on = new Array(n).fill(false), of = new Array(n).fill(-1);
  const stack = [], comps = [];
  let counter = 0;
  for (let r = 0; r < n; r++) {
    if (idx[r] >= 0) continue;
    const work = [[r, 0]];
    idx[r] = low[r] = counter++; stack.push(r); on[r] = true;
    while (work.length) {
      const top = work[work.length - 1], v = top[0];
      if (top[1] < adj[v].length) {
        const w = adj[v][top[1]++];
        if (idx[w] < 0) { idx[w] = low[w] = counter++; stack.push(w); on[w] = true; work.push([w, 0]); }
        else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === idx[v]) {
          const c = [];
          let w;
          do { w = stack.pop(); on[w] = false; of[w] = comps.length; c.push(w); } while (w !== v);
          comps.push(c);
        }
      }
    }
  }
  return { comps, of };
}
