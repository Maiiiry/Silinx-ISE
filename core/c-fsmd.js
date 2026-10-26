// Silinx C (#1526): a sequential C function as a finite state machine with a datapath (FSMD). The function's code is
// cut into basic blocks (what runs with no jump: its ifs and switches with no loop in them included), one state of the
// machine each, run in one clock cycle; its loops, the ifs with a loop in them, break, continue and return choose
// the next state. Its variables are registers (a static or a global keeping its value between calls); a block is run
// symbolically (core/c-dataflow.js) on the registers' values, giving their next values and the next state.
// The block protocol is Vitis HLS's ap_ctrl_hs: in the idle state the arguments are read when ap_start is 1; the
// last state of a call has ap_done and ap_ready 1, ap_return valid; a pointer output's _ap_vld is 1 one cycle after
// each write, its value then valid. Isomorphic ES module: no DOM and no Node APIs.
//
//   fsmd(checked) -> { graph, regs, states, entry, idle, done, ports, outputs, diagnostics }
//     regs:    [{ name, w, s, reset: BigInt, latch?: node id (its value read at the start of a call) }]
//     states:  [{ id, name, updates: Map reg -> node, next: node, line? }] (the blocks; idle and done apart)
//     outputs: Map port -> { reg } (a register shown on the port)
import { Flow, Stop } from './c-dataflow.js';
import { BOOL, typeOf } from './c-types.js';
import { constValue } from './c-check.js';

export function fsmd(checked) {
  return new SeqFlow(checked).runSeq();
}

const hasLoop = (n) => {
  let hit = false;
  const w = (x) => {
    if (!x || typeof x !== 'object' || hit) return;
    if (Array.isArray(x)) { x.forEach(w); return; }
    if (x.kind === 'for' || x.kind === 'while' || x.kind === 'do') { hit = true; return; }
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v);
  };
  w(n);
  return hit;
};
/** The line of the first statement of a list (inside its blocks, its pragmas apart), or null. */
const firstLine = (stmts) => {
  for (const s of stmts) {
    if (s.kind === 'pragma' || s.kind === 'empty') continue;
    if (s.kind === 'block') { const l = firstLine(s.items); if (l) return l; continue; }
    return s.loc?.line ?? null;
  }
  return null;
};
// (a deep copy keeping BigInt values: not core/util.js's clone, #1580)
const cloneBig = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { $big: String(v) } : v)), (k, v) => (v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v));

class SeqFlow extends Flow {
  // ------------------------------------------------------------------ the registers: every variable a unique name
  /** The top function's body with each local variable renamed to a name of its own (the registers'), and the list of
   *  its declarations. */
  renameLocals(fn) {
    const body = cloneBig(fn.body);
    const used = new Set([...fn.params.map((p) => p.name), ...this.c.funcs.keys(), ...this.globals.keys()]);
    const decls = [];
    const scopes = [new Map()];
    const look = (n) => { for (let k = scopes.length - 1; k >= 0; k--) if (scopes[k].has(n)) return scopes[k].get(n); return null; };
    const fresh = (n) => { let x = n, k = 1; while (used.has(x)) x = `${n}_${++k}`; used.add(x); return x; };
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.kind === 'block') { scopes.push(new Map()); x.items.forEach(walk); scopes.pop(); return; }
      if (x.kind === 'for') { scopes.push(new Map()); walk(x.init); walk(x.cond); walk(x.step); walk(x.body); scopes.pop(); return; }
      if (x.kind === 'decl') {
        for (const v of x.vars) { if (v.init) walk(v.init); const u = fresh(v.name); scopes.at(-1).set(v.name, u); v.name = u; decls.push(v); }
        return;
      }
      if (x.kind === 'id') { const u = look(x.name); if (u) x.name = u; return; }
      for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v);
    };
    walk(body);
    return { body, decls };
  }

  // ------------------------------------------------------------------ the blocks
  /** The control flow graph of a statement list: blocks { id, stmts, term, loop } (term: { goto } | { cond, t, f } |
   *  { done }), from `entry` to `next`. */
  cfg(items, next, loop) {
    const blocks = this.blocks;
    const mk = (lp) => { const b = { id: blocks.length + 1, stmts: [], term: null, loop: lp }; blocks.push(b); return b; };
    const seq = (list, after, lp) => {
      let cur = mk(lp);
      const entry = cur;
      for (const s of list) {
        if (!hasLoop(s)) { cur.stmts.push(s); continue; }
        if (s.kind === 'block') {
          const join = mk(lp);
          const e = seq(s.items, join, lp);
          cur.term = { goto: e };
          cur = join;
          continue;
        }
        if (s.kind === 'if') {
          const join = mk(lp);
          const t = seq([s.then], join, lp);
          const f = s.else ? seq([s.else], join, lp) : join;
          cur.term = { cond: s.cond, t, f };
          cur = join;
          continue;
        }
        if (s.kind === 'for' || s.kind === 'while' || s.kind === 'do') {
          const exit = mk(lp);
          const head = mk(lp);
          const step = s.kind === 'for' && s.step ? mk(lp) : null;
          const contTo = s.kind === 'do' ? head : (step || head);
          const L = { exit, cont: contTo };
          const body = seq([s.body], s.kind === 'do' ? head : (step || head), L);
          if (s.kind === 'for' && s.init) cur.stmts.push(s.init);
          cur.term = { goto: s.kind === 'do' ? body : head };
          const cond = s.kind === 'for' ? s.cond : s.cond;
          head.term = cond ? { cond, t: body, f: exit, loopHead: s } : { goto: body };
          if (s.kind === 'do') head.loopHead = s;
          if (step) { step.stmts.push({ kind: 'expr', e: s.step, loc: s.loc }); step.term = { goto: head }; }
          cur = exit;
          continue;
        }
        this.error(s.loc, `a '${s.kind}' with a loop in it is not supported yet in a sequential module`);
      }
      cur.term = after ? { goto: after } : { done: true };
      return entry;
    };
    return seq(items, next, loop);
  }

  // ------------------------------------------------------------------ the module
  runSeq() {
    const { top, funcs, ast } = this.c;
    const fn = funcs.get(top);
    this.fn = fn;
    this.ctrl = 'ap_ctrl_hs';
    this.modes = new Map();
    this.globals = new Map();
    for (const it of ast.items) if (it.kind === 'var') this.globals.set(it.name, it);
    for (const st of fn.body.items) {
      if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE') continue;
      const a = st.pragma.args;
      const mode = String(a.mode || Object.keys(a).find((k) => /^ap_/.test(k)) || '').toLowerCase();
      if (a.port === 'return' && mode === 'ap_ctrl_none') this.warn(st.loc, 'ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made');
      else if (a.port && a.port !== 'return') this.modes.set(a.port, mode);
    }
    this.retType = fn.ret.kind === 'void' ? null : typeOf(fn.ret);
    this.regs = new Map();
    this.blocks = [];
    try {
      for (const f of funcs.values()) if (f !== fn && f.name !== 'main' && f.body && hasLoop(f.body) && this.calls(fn, f.name)) this.error(f.loc, `'${f.name}' has a loop and is called from '${top}': a function with a loop called by another is not supported yet (write the loop in '${top}')`);
      const { body, decls } = this.renameLocals(fn);
      this.makeRegisters(fn, decls);
      this.entry = this.cfg(body.items, null, null);
      this.thread();
      this.runBlocks();
    } catch (e) { if (!(e instanceof Stop)) throw e; }
    return this.result();
  }
  calls(fn, name) {
    let hit = false;
    const w = (x) => { if (!x || typeof x !== 'object' || hit) return; if (Array.isArray(x)) { x.forEach(w); return; } if (x.kind === 'call' && x.callee?.name === name) hit = true; for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v); };
    w(fn.body);
    return hit;
  }
  /** A register of `name` (w bits, s signed; reset its value at the reset; latch the node it takes at a call's
   *  start). */
  reg(name, t, reset = 0n, latch = null) {
    if (!this.regs.has(name)) this.regs.set(name, { name, w: t.w, s: !!t.s, t, reset: BigInt(reset), latch });
    return this.regs.get(name);
  }
  regNode(r) { return this.g.add('reg', [], r.t, { port: { key: `reg:${r.name}`, name: `ap_r_${r.name}` } }); }
  makeRegisters(fn, decls) {
    this.slots = new Map();
    // the arguments: read at the start of a call (latched), a pointer's value its register
    for (const pa of fn.params) {
      const t = pa.type;
      if (t.kind === 'array' || (t.kind === 'ptr' && t.to.kind === 'array')) this.error(pa.loc, `the array argument '${pa.name}': array arguments (ap_memory) are not supported yet (#1527)`);
      if (t.kind === 'ptr') {
        const et = typeOf(t.to);
        if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer pointer`);
        const r = this.reg(`${pa.name}_reg`, et);
        const out = { name: pa.name, t: et, reg: r, val: null, vld: this.F, read: false, written: false, loc: pa.loc };
        this.outs.set(pa.name, out);
        this.slots.set(pa.name, { kind: 'out', out });
        continue;
      }
      const et = typeOf(t);
      if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer`);
      const r = this.reg(`${pa.name}_reg`, et, 0n, this.input(pa.name, et).id);
      this.slots.set(pa.name, { kind: 'var', t: et, reg: r, name: pa.name });
    }
    // the locals (statics: their initial value at the reset), the globals written
    for (const v of decls) this.slots.set(v.name, this.regSlot(v));
    for (const [name, gv] of this.globals) if (!gv.const) this.slots.set(name, this.regSlot({ ...gv, static: true }));
    if (this.retType) this.retReg = this.reg('ap_return_reg', this.retType);
  }
  regSlot(v) {
    const t = v.type;
    const init = (e) => (e ? constValue(e, this.consts()) : 0n);
    if (t.kind === 'array') {
      const et = typeOf(t.of);
      if (!et) this.error(v.loc, `'${v.name}': only arrays of integers (one dimension) are supported yet`);
      const n = t.length ?? (v.init?.kind === 'init' ? v.init.items.length : null);
      if (!n) this.error(v.loc, `'${v.name}': an array needs its size`);
      if (n > 64) this.error(v.loc, `'${v.name}': an array of more than 64 elements (a memory) is not supported yet (#1527)`);
      const regs = Array.from({ length: n }, (_, k) => this.reg(`${v.name}_${k}`, et, v.static && v.init?.kind === 'init' ? (init(v.init.items[k]) ?? 0n) : 0n));
      if (v.static && v.init?.kind === 'init' && v.init.items.some((x) => constValue(x, this.consts()) === null)) this.error(v.loc, `the static '${v.name}': its initial values must be constants`);
      return { kind: 'array', t: et, regs, elems: null, name: v.name };
    }
    const et = typeOf(t);
    if (!et) this.error(v.loc, `'${v.name}' is not an integer`);
    let reset = 0n;
    if (v.static && v.init) { reset = init(v.init); if (reset === null) this.error(v.loc, `the static '${v.name}': its initial value must be a constant`); }
    return { kind: 'var', t: et, reg: this.reg(v.name, et, reset), name: v.name, static: !!v.static };
  }
  /** A goto-only block with no statement is skipped (its predecessors go where it goes). */
  thread() {
    const target = (b) => { const seen = new Set(); while (b && !b.stmts.length && b.term?.goto && !seen.has(b)) { seen.add(b); b = b.term.goto; } return b; };
    for (const b of this.blocks) {
      if (b.term?.goto) b.term.goto = target(b.term.goto);
      if (b.term?.cond) { b.term.t = target(b.term.t); b.term.f = target(b.term.f); }
      if (b.loop) b.loop = { exit: target(b.loop.exit), cont: target(b.loop.cont) };
    }
    this.entry = target(this.entry);
    // the blocks reached, numbered from 1 (0: idle; the last: done)
    const reached = [], seen = new Set();
    const visit = (b) => {
      if (!b || seen.has(b)) return;
      seen.add(b); reached.push(b);
      if (b.term?.goto) visit(b.term.goto);
      if (b.term?.cond) { visit(b.term.t); visit(b.term.f); }
      if (b.loop) { visit(b.loop.exit); visit(b.loop.cont); }
    };
    visit(this.entry);
    reached.forEach((b, k) => { b.num = k + 1; });
    this.reached = reached;
    this.doneNum = reached.length + 1;
    this.stateT = { w: Math.max(1, (this.doneNum).toString(2).length), s: false };
  }
  // ------------------------------------------------------------------ each block, symbolically
  declare(v, g) {
    const slot = this.slots.get(v.name);
    if (!v.init || v.static) return;   // (a static is initialized once, at the reset)
    if (slot.kind === 'array') {
      if (v.init.kind !== 'init') this.error(v.loc, `'${v.name}': an array is initialized with { … }`);
      v.init.items.forEach((x, k) => { if (k < slot.elems.length) slot.elems[k] = this.mux(g, this.conv(this.expr(x, g), slot.t).id, slot.elems[k], slot.t); });
      return;
    }
    slot.val = this.mux(g, this.conv(this.expr(v.init, g), slot.t).id, slot.val, slot.t);
  }
  loop(s) { this.error(s.loc, 'internal: a loop inside a block'); }
  runBlocks() {
    const st = (n) => this.g.const(n, this.stateT);
    this.states = [];
    for (const b of this.reached) {
      // every register at its current value
      for (const slot of this.slots.values()) {
        if (slot.kind === 'var') slot.val = this.regNode(slot.reg);
        if (slot.kind === 'array') slot.elems = slot.regs.map((r) => this.regNode(r));
        if (slot.kind === 'out') { slot.out.val = this.regNode(slot.out.reg); slot.out.vld = this.F; }
      }
      const loopRec = b.loop ? { brk: this.F, cont: this.F } : null;
      this.frame = { fn: this.fn, returned: this.F, ret: this.retReg ? this.regNode(this.retReg) : null, rt: this.retType, loops: loopRec ? [loopRec] : [] };
      this.scopes = [this.slots];
      for (const s of b.stmts) this.stmt(s, this.T);
      // the next state: after a return, done; a break, its loop's exit; a continue, its loop's next iteration; else
      // the block's own end
      let next;
      if (b.term.done) next = st(this.doneNum);
      else if (b.term.goto) next = st(b.term.goto.num);
      else {
        const c = this.bool(this.expr(b.term.cond, this.guard(this.T)));
        next = this.mux(c, st(b.term.t.num), st(b.term.f.num), this.stateT);
      }
      if (loopRec) {
        next = this.mux(loopRec.cont, st(b.loop.cont.num), next, this.stateT);
        next = this.mux(loopRec.brk, st(b.loop.exit.num), next, this.stateT);
      }
      next = this.mux(this.frame.returned, st(this.doneNum), next, this.stateT);
      const updates = new Map();
      for (const slot of this.slots.values()) {
        if (slot.kind === 'var' && slot.val !== this.regNode(slot.reg)) updates.set(slot.reg.name, slot.val);
        if (slot.kind === 'array') slot.regs.forEach((r, k) => { if (slot.elems[k] !== this.regNode(r)) updates.set(r.name, slot.elems[k]); });
        if (slot.kind === 'out') {
          const o = slot.out;
          if (o.val !== this.regNode(o.reg)) updates.set(o.reg.name, o.val);
          if (o.vld !== this.F) { updates.set(`${o.name}_vld_reg`, o.vld); this.reg(`${o.name}_vld_reg`, BOOL); }
        }
      }
      if (this.retReg && this.frame.ret !== this.regNode(this.retReg)) updates.set(this.retReg.name, this.frame.ret);
      this.states.push({ id: b.num, updates, next, line: firstLine(b.stmts) });
    }
  }
  // the outputs read before they are written: a pointer read and written takes its input at the start of a call
  readOut(o) {
    o.read = true;
    if (!o.latched) {
      o.latched = true;
      const key = `${o.name}#in`;
      this.inputs.set(key, { name: key, t: o.t, port: { key, name: o.name }, id: null });
      const i = this.inputs.get(key);
      i.id = this.g.add('in', [], o.t, { port: i.port });
      o.reg.latch = i.id;
    }
    return this.v(o.val, o.t);
  }
  storeDeref(slot, val, g, l) {
    const r = super.storeDeref(slot, val, g, l);
    return r;
  }
  result() {
    const ports = [], outputs = new Map();
    for (const pa of this.fn.params) {
      const o = this.outs.get(pa.name);
      if (!o) {
        const i = this.inputs.get(pa.name);
        if (i) ports.push({ name: pa.name, dir: 'in', w: i.t.w, s: i.t.s, role: 'arg', param: pa.name });
        continue;
      }
      const mode = this.modes.get(pa.name) || '';
      if (o.read && !o.written) { ports.push({ name: pa.name, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); continue; }
      if (!o.written) continue;
      const base = o.read ? `${pa.name}_o` : pa.name;
      if (o.read) { this.inputs.get(`${pa.name}#in`).port.name = `${pa.name}_i`; ports.push({ name: `${pa.name}_i`, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); }
      ports.push({ name: base, dir: 'out', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name });
      outputs.set(base, { reg: o.reg.name });
      if (mode !== 'ap_none') {
        ports.push({ name: `${base}_ap_vld`, dir: 'out', w: 1, s: false, role: 'arg_vld', param: pa.name });
        outputs.set(`${base}_ap_vld`, { reg: `${pa.name}_vld_reg` });
        this.reg(`${pa.name}_vld_reg`, BOOL);
      }
    }
    if (this.retReg) { ports.push({ name: 'ap_return', dir: 'out', w: this.retType.w, s: this.retType.s, role: 'return' }); outputs.set('ap_return', { reg: this.retReg.name }); }
    return {
      graph: this.g, regs: [...(this.regs?.values() || [])], states: this.states || [], entry: this.entry?.num ?? 1, idle: 0, done: this.doneNum ?? 1,
      stateT: this.stateT, ports, outputs, ctrl: 'ap_ctrl_hs', diagnostics: this.diags,
    };
  }
}
