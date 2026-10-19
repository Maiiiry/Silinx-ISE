// ISim's path resolution and forces (#405: out of mountISim): finding a signal or an instance by its path (absolute,
// or relative to the selected instance), and the forces (isim force add / remove, the drawn stimuli) as
// pseudo-processes of the simulator. mountForces(ctx) is called by mountISim where this code was.
import { pathOf } from './isim.js';

/** { findSignal, findInst, injectForce, isForced, addForce, removeForces } of an ISim window. */
export function mountForces(ctx) {
  const { st, sim, design, invalidate, logLine, objectsChanged } = ctx;

  // ---------------------------------------------------------------- path resolution
  function normPath(p) { return String(p).trim().replace(/^\/+/, '').replace(/\//g, '.').toLowerCase(); }
  function findSignal(p) {
    const n = normPath(p);
    const cands = [n];
    if (st.curInst) cands.push(normPath(st.curInst.path) + '.' + n);
    if (design.top) cands.push(normPath(design.top.path) + '.' + n);
    for (const c of cands) {
      const s = design.signals.find(s => s.path.toLowerCase() === c);
      if (s) return s;
      // port aliases: inst.port names map to parent signals
      const dot = c.lastIndexOf('.');
      const inst = findInst(c.slice(0, dot));
      const port = inst?.ports.find(pp => pp.name.toLowerCase() === c.slice(dot + 1));
      if (port) return port.sig;
    }
    return null;
  }
  function findInst(p) {
    const n = normPath(p);
    let res = null;
    const walk = (i) => { if (res) return; if (i.path.toLowerCase() === n) res = i; else i.children.forEach(walk); };
    if (design.top) walk(design.top);
    if (!res && st.curInst && n) {
      const m = normPath(st.curInst.path) + '.' + n;
      const w2 = (i) => { if (res) return; if (i.path.toLowerCase() === m) res = i; else i.children.forEach(w2); };
      w2(design.top);
    }
    return res;
  }

  // ---------------------------------------------------------------- forces (injected stimulus processes)
  // A force is a pattern of {off, val} applied from `start` (absolute ps), optionally repeating every `repeat`
  // ps, until `end` (absolute ps; the signal is released there when `endRelease`). It runs inside the
  // simulator as a pseudo-process woken through the event heap, so forced values land at exact times and
  // override drivers. Forces form a history: a new force on the same signal truncates the previous one, and
  // Restart replays the whole history from time 0.
  function injectForce(f) {
    const sigRef = f.sig;
    const from = sim.now;
    const gen = (function* () {
      let base = f.start;
      // (re)injected mid-flight: skip the cycles that are already in the past
      if (f.repeat && from > f.start) base += Math.floor((from - f.start) / f.repeat) * f.repeat;
      for (;;) {
        for (const ev of f.pattern) {
          const tk = base + ev.off;
          if (tk < from && (f.repeat || ev !== f.pattern[f.pattern.length - 1])) continue;
          if (f.end != null && tk >= f.end) {
            if (f.endRelease) { if (f.end > sim.now) yield { delay: f.end - sim.now }; sim.release(sigRef); }
            return;
          }
          if (tk > sim.now) yield { delay: tk - sim.now };
          sim.force(sigRef, ev.val);
        }
        if (!f.repeat) break;
        base += f.repeat;
      }
      if (f.end != null && f.endRelease) {
        if (f.end > sim.now) yield { delay: f.end - sim.now };
        sim.release(sigRef);
      }
    })();
    const rt = { p: { name: `isim_force_${sigRef.name}`, kind: 'force', inst: design.top, file: null, loc: null }, gen, done: false, rec: null, ctx: null };
    f.rt = rt;
    sim.heap.push(Math.max(f.start, sim.now), { wake: rt });
  }
  const forceActive = (f, t = sim.now) => f.start <= t ? (f.end == null || f.end > t) : true;
  function isForced(sig) { return st.forces.some(f => f.sig === sig && forceActive(f)); }
  // stop the forces of `sig` at time `t` (dropping those that have not started yet)
  function truncateForces(sig, t, release) {
    const keep = [];
    for (const f of st.forces) {
      if (f.sig !== sig) { keep.push(f); continue; }
      if (f.start >= t) { if (f.rt) f.rt.done = true; continue; }
      if (f.end == null || f.end > t) {
        f.end = t; f.endRelease = release;
        if (f.rt) f.rt.done = true;
        if (!sim.finished && t > sim.now) injectForceTail(f);
      }
      keep.push(f);
    }
    st.forces = keep;
  }
  // re-create the generator of a running force so it observes a new end time
  function injectForceTail(f) { injectForce(f); }
  function addForce(sig, { pattern, start = sim.now, repeat = 0, cancel = null, desc }) {
    start = Math.round(start);
    truncateForces(sig, start, false);
    const f = { id: st.forceSeq++, sig, pattern, start, repeat: Math.round(repeat), end: cancel == null ? null : Math.round(cancel), endRelease: true, desc };
    st.forces.push(f);
    if (sim.finished) { logLine('WARNING: simulation has finished; the force takes effect after restart', 'warning'); }
    else {
      injectForce(f);
      // apply immediately when starting now, so the change is visible without running
      if (f.start <= sim.now && pattern[0]?.off === 0) {
        if (!sim.started) sim.start();
        sim.force(sig, pattern[0].val);
        sim.run(sim.now);
      }
    }
    invalidate(false); objectsChanged();
    return f;
  }
  function removeForces(sig, silent) {
    if (!st.forces.some(f => f.sig === sig)) return;
    truncateForces(sig, sim.now, true);
    sim.release(sig);
    if (!silent) { logLine(`Force removed from ${pathOf(sig)}`, 'info'); invalidate(false); }
  }

  return { findSignal, findInst, injectForce, isForced, addForce, removeForces };
}
