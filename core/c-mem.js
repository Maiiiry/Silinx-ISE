// Silinx C (#1527): the memories of a sequential module (core/c-fsmd.js). An array argument is a memory outside the
// module, Vitis HLS's ap_memory interface (<arg>_address0, _ce0, _we0, _d0, _q0: one port, a read's value on _q0 the
// cycle after its address); a local, static or constant array of more than MEM_MIN elements is a memory inside the
// module with the same port, a block RAM's (its contents its initial values: a ROM when it is never written).
// Each access takes a state of its own: a statement reading a memory is cut into a state per read (its address
// driven) and the statement's own state (the values read, kept in registers ap_r_ap_mem_<n>); a write is a
// statement of its own (a[i] = v; a[i] += v; a[i]++). Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, typeOf } from './c-types.js';
import { constValue } from './c-check.js';

export const MEM_MIN = 64;   // a local array of more elements than this is a memory (fewer: registers)

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const SIDE = new Set(['assign', 'postfix', 'call']);

export const memMethods = {
  /** A memory: { kind: 'mem', name, t, n, aw, ext, init: [BigInt] | null, rom, static, read, written, acc }. */
  memSlot(v, { ext = false } = {}) {
    const t = v.type;
    if (t.of.kind === 'array') this.error(v.loc, `'${v.name}': an array of arrays as a memory is not supported yet: one dimension`);
    const et = typeOf(t.of);
    if (!et) this.error(v.loc, `'${v.name}': only arrays of integers are supported`);
    const n = t.length ?? (v.init?.kind === 'init' ? v.init.items.length : null);
    if (!n) this.error(v.loc, ext ? `the array argument '${v.name}' needs its size (the memory's depth): ${v.name}[N]` : `'${v.name}': an array needs its size`);
    let init = null;
    if (v.init) {
      if (v.init.kind !== 'init') this.error(v.loc, `'${v.name}': an array is initialized with { … }`);
      init = v.init.items.map((x) => { const c = constValue(x, this.consts()); if (c === null) this.error(x.loc || v.loc, `'${v.name}': a memory's initial values must be constants`); return c; });
    }
    return { kind: 'mem', name: v.name, t: et, n: Number(n), aw: clog2(Number(n)), ext, init, rom: !!v.const, static: !!v.static, read: false, written: false, loc: v.loc, reads: 0 };
  },
  isMem(e) { return e?.kind === 'index' && e.e.kind === 'id' && this.slots.get(e.e.name)?.kind === 'mem'; },
  hasMem(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (this.isMem(n) || (n.kind === 'id' && this.slots.get(n.name)?.kind === 'mem')) { hit = true; return; }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(x);
    return hit;
  },
  hasSide(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (SIDE.has(n.kind) || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) { hit = true; return; }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(x);
    return hit;
  },

  /** The reads of memories in e moved before it: each a state driving its address, its value then in a register;
   *  e with each read a variable. `at` is the block (the cursor, its successors made by mk). */
  hoist(e, at) {
    if (!e || typeof e !== 'object') return e;
    if (Array.isArray(e)) return e.map((x) => this.hoist(x, at));
    if (this.isMem(e)) {
      const mem = this.slots.get(e.e.name);
      const i = this.hoist(e.i, at);
      if (this.hasSide(i)) this.error(e.loc, `the index of the memory '${mem.name}' must have no side effect (no ++, --, assignment or call)`);
      const tmp = `ap_mem_${mem.name}_${mem.reads++}`;
      this.slots.set(tmp, { kind: 'var', t: mem.t, reg: this.reg(tmp, mem.t), name: tmp });
      mem.read = true;
      if (at.cur.acc?.has(mem.name)) at.next();
      at.cur.stmts.push({ kind: 'memread', mem: mem.name, i, loc: e.loc });
      (at.cur.acc ||= new Set()).add(mem.name);
      at.next();
      at.cur.stmts.push({ kind: 'memlatch', mem: mem.name, tmp, loc: e.loc });
      return { kind: 'id', name: tmp, loc: e.loc };
    }
    if (e.kind === 'id' && this.slots.get(e.name)?.kind === 'mem') this.error(e.loc, `the memory '${e.name}' can only be indexed here (${e.name}[i]): it cannot be passed to a function`);
    const out = {};
    for (const [k, v] of Object.entries(e)) out[k] = k === 'loc' || k === 'type' ? v : this.hoist(v, at);
    return out;
  },
  /** A memory named but not indexed (passed to a function): an error. */
  bareMem(x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y) => this.bareMem(y)); return; }
    if (this.isMem(x)) { this.bareMem(x.i); return; }
    if (x.kind === 'id' && this.slots.get(x.name)?.kind === 'mem') this.error(x.loc, `the memory '${x.name}' can only be indexed here (${x.name}[i]): it cannot be passed to a function`);
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') this.bareMem(v);
  },
  /** A statement with no loop that accesses a memory, into the blocks after `cur`; returns the last block. */
  lowerMem(s, cur, mk, lp) {
    this.bareMem(s);
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    if (s.kind === 'expr') {
      const e = s.e;
      const target = e.kind === 'assign' ? e.l : (e.kind === 'postfix' || (e.kind === 'unary' && (e.op === '++' || e.op === '--'))) ? e.e : null;
      if (target && this.isMem(target)) {
        const mem = this.slots.get(target.e.name);
        if (mem.rom) this.error(target.loc, `'${mem.name}' is constant: it cannot be written`);
        const one = { kind: 'num', value: 1n, text: '1', loc: e.loc };
        const rhs = e.kind === 'assign' ? (e.op === '=' ? e.r : { kind: 'binary', op: e.op.slice(0, -1), l: target, r: e.r, loc: e.loc }) : { kind: 'binary', op: e.op === '++' ? '+' : '-', l: target, r: one, loc: e.loc };
        if (this.hasSide(target.i) || this.hasSide(rhs)) this.error(e.loc, `a write of the memory '${mem.name}' with another side effect in it (++, --, an assignment, a call): write them as statements of their own`);
        const i = this.hoist(target.i, at), v = this.hoist(rhs, at);
        if (at.cur.acc?.has(mem.name)) at.next();
        at.cur.stmts.push({ kind: 'memwrite', mem: mem.name, i, v, loc: e.loc });
        (at.cur.acc ||= new Set()).add(mem.name);
        mem.written = true;
        return at.cur;
      }
      const inner = target ? (e.kind === 'assign' ? e.r : null) : e;
      if (inner && this.hasSide(inner) && this.hasMem(inner)) this.error(e.loc, 'a statement reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const he = this.hoist(e, at);   // (first: it moves at.cur)
      at.cur.stmts.push({ ...s, e: he });
      return at.cur;
    }
    if (s.kind === 'decl') {
      for (const v of s.vars) if (v.init && this.hasSide(v.init) && this.hasMem(v.init)) this.error(v.loc, 'a declaration reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const vars = s.vars.map((v) => ({ ...v, init: v.init ? this.hoist(v.init, at) : v.init }));
      at.cur.stmts.push({ ...s, vars });
      return at.cur;
    }
    if (s.kind === 'return') {
      if (s.e && this.hasSide(s.e)) this.error(s.loc, 'a return reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const he = s.e ? this.hoist(s.e, at) : s.e;
      at.cur.stmts.push({ ...s, e: he });
      return at.cur;
    }
    this.error(s.loc, `a '${s.kind}' that accesses a memory is not supported yet in a sequential module (write the access as a statement of its own before it)`);
    return cur;
  },
  /** A condition (an if's, a loop's) reading a memory: its reads in the blocks after at.cur. */
  hoistCond(e, cur, mk, lp) {
    if (!this.hasMem(e)) return { e, cur };
    this.bareMem(e);
    if (this.hasSide(e)) this.error(e.loc, 'a condition reading a memory with a side effect in it (++, --, an assignment, a call): write them as statements of their own');
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    const r = this.hoist(e, at);
    return { e: r, cur: at.cur };
  },

  // ------------------------------------------------------------------ run in a state
  memStmt(s, base) {
    const mem = this.slots.get(s.mem);
    const g = this.guard(base);
    const at = { w: mem.aw, s: false };
    if (s.kind === 'memlatch') { this.slots.get(s.tmp).val = this.memQ(mem); return; }
    const addr = this.conv(this.expr(s.i, g), at).id;
    const acc = { addr, ce: g, we: this.F, d: null };
    if (s.kind === 'memwrite') { acc.we = g; acc.d = this.conv(this.expr(s.v, g), mem.t).id; }
    this.access.set(mem.name, acc);
  },
  memQ(mem) {
    const port = mem.ext ? { key: `${mem.name}_q0`, name: `${mem.name}_q0`, param: mem.name, suffix: '_q0' } : { key: `mem:${mem.name}`, name: `ap_m_${mem.name}_q0` };
    return this.g.add(mem.ext ? 'in' : 'reg', [], mem.t, { port });
  },
  /** The memories' ports and signals, driven by the states that access them: { ext: [port], mems: [internal] }. */
  memPorts(states) {
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    const mems = [];
    for (const mem of this.slots.values()) {
      if (mem.kind !== 'mem') continue;
      if (!mem.ext && !mem.static && !mem.rom && mem.init && mem.written) this.error(mem.loc, `'${mem.name}': a memory initialized with { … } and written: make it static (its values kept between calls) or const, or initialize it with a loop`);
      const at = { w: mem.aw, s: false };
      let addr = this.g.const(0, at), ce = this.F, we = this.F, d = this.g.const(0, mem.t);
      for (const st of states) {
        const a = st.access.get(mem.name);
        if (!a) continue;
        const here = this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL);
        addr = this.mux(here, a.addr, addr, at);
        ce = this.or(ce, this.and(here, a.ce));
        if (a.d !== null) { we = this.or(we, this.and(here, a.we)); d = this.mux(here, a.d, d, mem.t); }
      }
      mems.push({ ...mem, addr, ce, we: mem.written ? we : null, d: mem.written ? d : null });
    }
    return mems;
  },
};
