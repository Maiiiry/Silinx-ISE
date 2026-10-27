// Silinx C (#1528): the C simulation: a C source's main() (its test bench) run by an interpreter of Silinx C, as Vitis
// HLS's "C simulation" runs it compiled: printf's output, main()'s return value, and each call of the top function
// with its arguments and results (what C/RTL co-simulation replays on the generated HDL, core/c-cosim.js).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   simulateC(source, { file, maxSteps, entry = 'main' }) ->
//     { ok, output, exitCode, calls, error, steps, top, diagnostics }
//     calls: [{ args: { name: BigInt }, ptrIn: { name: BigInt }, ptrOut: { name: BigInt }, memIn: { name: [BigInt] },
//              memOut: { name: [BigInt] }, ret: BigInt | null }]: each call of the top function: the scalar arguments,
//              each pointer's value before (ptrIn) and after (ptrOut), each array's values before and after (#1527)
//     error: { line, col, message } when the run stopped (a division by zero, an index outside an array, an endless loop)
import { checkC, constValue } from './c-check.js';
import { typeOf } from './c-types.js';
import { exprMethods, convert } from './c-interp-expr.js';
import { libMethods, Exit } from './c-interp-lib.js';

export const MAX_STEPS = 20_000_000;

class Halt extends Error { constructor(loc, message) { super(message); this.loc = loc; } }
class Return { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

// (files: the test bench's data files, { path: text }, read by fopen; its run's written files in the result's files, #1598)
export function simulateC(source, { file = 'input.c', maxSteps = MAX_STEPS, entry = 'main', headers = null, top = null, files = null } = {}) {
  const checked = checkC(source, file, { headers, top });
  // (a test bench with no function to synthesize still runs)
  const errors = checked.diagnostics.filter((d) => d.severity === 'error' && !/^no function to synthesize/.test(d.message));
  if (errors.length) return { ok: false, output: '', exitCode: null, calls: [], error: null, steps: 0, top: checked.top, diagnostics: checked.diagnostics };
  const m = new Machine(checked, maxSteps);
  m.files = files || headers || {};
  const r = m.run(entry);
  return { ...r, top: checked.top, diagnostics: checked.diagnostics, files: Object.fromEntries(m.fs) };
}

class Machine {
  constructor(checked, maxSteps) {
    this.c = checked;
    this.maxSteps = maxSteps;
    this.steps = 0;
    this.out = [];
    this.calls = [];
    this.frames = [];
    this.globals = new Map();
    this.fs = new Map();
    // (stdio's streams: stdout and stderr in the output, stdin empty)
    for (const [n, std] of [['stdout', 'out'], ['stderr', 'out'], ['stdin', 'in']]) this.globals.set(n, { isFile: true, fh: std === 'in' ? { name: 'stdin', text: '', pos: 0, w: false } : { std }, t: { w: 32, s: true } });
  }
  tick(n) { if (++this.steps > this.maxSteps) throw new Halt(n?.loc, `the C simulation stopped after ${this.maxSteps.toLocaleString('en')} steps (an endless loop?)`); }
  fail(n, message) { throw new Halt(n?.loc, message); }
  find(name) {
    const f = this.frames.at(-1);
    if (f) for (let k = f.scopes.length - 1; k >= 0; k--) if (f.scopes[k].has(name)) return f.scopes[k].get(name);
    return this.globals.get(name) || null;
  }
  lookup(name, n) {
    const c = this.find(name);
    if (!c) this.fail(n, `'${name}' is not declared`);
    return c;
  }
  /** A new variable (a cell { t, v }, an array { t, arr: [cells] }, a pointer { t, ref }) from its declaration. */
  cell(v, scope) {
    const t = v.type;
    if (t.kind === 'array') {
      // (an array of arrays: its cells in one list, its dimensions kept; a[i] of one is a view of its row)
      const dims = [];
      let at = t;
      for (; at.kind === 'array'; at = at.of) dims.push(at.length ?? (at === t && v.init?.kind === 'init' ? v.init.items.length : 0));
      const et = typeOf(at);
      if (!et) this.fail(v, `'${v.name}': only arrays of integers can be simulated`);
      const n = dims.reduce((a, b) => a * b, 1);
      const arr = Array.from({ length: n }, () => ({ v: 0n }));
      const flat = [];
      const walk = (x) => { if (x?.kind === 'init') x.items.forEach(walk); else flat.push(x); };
      if (v.init?.kind === 'init') walk(v.init);
      flat.forEach((x, k) => { if (k < n && x) arr[k].v = convert(this.intOf(this.eval(x), x), et); });
      if (v.init?.kind === 'str') [...v.init.value].forEach((ch, k) => { if (k < n) arr[k].v = BigInt(ch.charCodeAt(0)); });
      return { t: et, arr, dims };
    }
    if (t.kind === 'ptr' && t.to.kind === 'struct' && t.to.name === 'FILE') return { isFile: true, fh: v.init ? this.eval(v.init).fh ?? null : null, t: { w: 32, s: true } };
    if (t.kind === 'ptr') {
      const c = { t: typeOf(t.to), ref: null };
      if (v.init) { const p = this.eval(v.init); c.ref = p.ptr || (p.arr ? this.elemRef(p.arr, 0, p.t) : null); }
      return c;
    }
    const et = typeOf(t);
    if (!et) this.fail(v, `'${v.name}' is not an integer: it cannot be simulated`);
    return { t: et, v: v.init ? convert(this.intOf(this.eval(v.init), v.init), et) : 0n };
  }
  elemRef(arr, index, t) {
    const cell = arr[index];
    return { get: () => ({ v: cell.v, t }), set: (x) => { cell.v = convert(this.intOf(x), t); }, t, arr, index };
  }

  run(entry) {
    const { ast, funcs } = this.c;
    try {
      for (const it of ast.items) if (it.kind === 'var') this.globals.set(it.name, this.cell(it));
      const fn = funcs.get(entry);
      if (!fn?.body) return { ok: false, output: '', exitCode: null, calls: [], error: { line: 1, col: 1, message: `no ${entry}() to run: the C simulation runs the test bench, main()` }, steps: 0 };
      const r = this.invoke(fn, []);
      return { ok: true, output: this.out.join(''), exitCode: r ? Number(convert(r.v ?? 0n, { w: 32, s: true })) : 0, calls: this.calls, error: null, steps: this.steps };
    } catch (e) {
      if (e instanceof Exit) return { ok: true, output: this.out.join(''), exitCode: e.code, calls: this.calls, error: null, steps: this.steps };
      if (!(e instanceof Halt)) throw e;
      return { ok: false, output: this.out.join(''), exitCode: null, calls: this.calls, error: { line: e.loc?.line || 1, col: e.loc?.col || 1, message: e.message }, steps: this.steps };
    }
  }
  /** A call: its arguments (values; pointers and arrays by reference), its body run; the top function's recorded. */
  call(e) {
    if (e.callee.kind === 'member') return this.member(e);
    const name = e.callee.name;
    const fn = this.c.funcs.get(name);
    if (!fn) return this.library(name, e);
    if (!fn.body) this.fail(e, `'${name}' is declared but not defined`);
    const args = e.args.map((a, k) => {
      const pt = fn.params[k]?.type;
      const x = this.eval(a);
      if (pt?.kind === 'ptr' || pt?.kind === 'array') {
        if (x.arr) return { arr: x.arr, t: x.t };
        if (x.ptr) return { ptr: x.ptr, t: x.t };
        this.fail(a, `the argument of '${fn.params[k].name}' must be a pointer or an array`);
      }
      return x;
    });
    const isTop = name === this.c.top && this.frames.length && this.frames.at(-1).fn.name !== name;
    let rec = null;
    if (isTop) {
      rec = { args: {}, ptrIn: {}, ptrOut: {}, memIn: {}, memOut: {}, ret: null };
      fn.params.forEach((pa, k) => {
        const a = args[k];
        if (a.arr) rec.memIn[pa.name] = a.arr.map((c) => c.v);
        if (a.ptr) rec.ptrIn[pa.name] = a.ptr.get().v;
        else if (!a.arr) rec.args[pa.name] = convert(this.intOf(a, e), typeOf(pa.type));
      });
    }
    const r = this.invoke(fn, args, e);
    if (rec) {
      fn.params.forEach((pa, k) => { if (args[k].ptr) rec.ptrOut[pa.name] = args[k].ptr.get().v; if (args[k].arr) rec.memOut[pa.name] = args[k].arr.map((c) => c.v); });
      rec.ret = r?.v ?? null;
      this.calls.push(rec);
    }
    return r ?? { v: 0n, t: { w: 32, s: true } };
  }
  invoke(fn, args, at) {
    if (this.frames.length > 200) this.fail(at, 'the calls go too deep (recursion?)');
    const scope = new Map();
    fn.params.forEach((pa, k) => {
      const a = args[k];
      if (!a) return;
      if (a.arr) scope.set(pa.name, { t: a.t, arr: a.arr });
      else if (a.ptr) scope.set(pa.name, { t: a.t, ref: a.ptr });
      else { const t = typeOf(pa.type); scope.set(pa.name, { t, v: convert(this.intOf(a, at), t) }); }
    });
    this.frames.push({ fn, scopes: [scope] });
    try {
      for (const s of fn.body.items) {
        const r = this.stmt(s);
        if (r instanceof Return) return r.value && fn.ret.kind !== 'void' ? { v: convert(this.intOf(r.value, s), typeOf(fn.ret)), t: typeOf(fn.ret) } : null;
      }
      return null;
    } finally { this.frames.pop(); }
  }
  // ------------------------------------------------------------------ statements: undefined, a Return, BREAK, CONTINUE
  stmt(s) {
    if (!s) return undefined;
    this.tick(s);
    const f = this.frames.at(-1);
    switch (s.kind) {
      case 'block': {
        f.scopes.push(new Map());
        try { for (const x of s.items) { const r = this.stmt(x); if (r !== undefined) return r; } } finally { f.scopes.pop(); }
        return undefined;
      }
      case 'decl':
        for (const v of s.vars) {
          if (v.static) {
            const key = `${f.fn.name}:${v.name}:${v.loc.line}:${v.loc.col}`;
            (this.statics ||= new Map());
            if (!this.statics.has(key)) this.statics.set(key, this.cell(v));
            f.scopes.at(-1).set(v.name, this.statics.get(key));
          } else f.scopes.at(-1).set(v.name, this.cell(v));
        }
        return undefined;
      case 'expr': this.eval(s.e); return undefined;
      case 'if': return this.truth(this.eval(s.cond)) ? this.stmt(s.then) : this.stmt(s.else);
      case 'return': return new Return(s.e ? this.eval(s.e) : null);
      case 'break': return BREAK;
      case 'continue': return CONTINUE;
      case 'for': case 'while': case 'do': return this.loop(s);
      case 'switch': return this.switchStmt(s);
      case 'pragma': case 'empty': case 'case': case 'default': return undefined;
      case 'label': return this.stmt(s.stmt);   // (#1601)
      default: this.fail(s, `'${s.kind}' cannot be simulated`);
    }
    return undefined;
  }
  loop(s) {
    const f = this.frames.at(-1);
    f.scopes.push(new Map());
    try {
      if (s.kind === 'for' && s.init) this.stmt(s.init);
      for (let first = true; ; first = false) {
        if ((s.kind !== 'do' || !first) && s.cond && !this.truth(this.eval(s.cond))) break;
        const r = this.stmt(s.body);
        if (r === BREAK) break;
        if (r instanceof Return) return r;
        if (s.kind === 'for' && s.step) this.eval(s.step);
        if (s.kind === 'do' && !this.truth(this.eval(s.cond))) break;
        if (s.kind === 'do') first = true;   // (its condition just tested)
      }
    } finally { f.scopes.pop(); }
    return undefined;
  }
  switchStmt(s) {
    const v = this.intOf(this.eval(s.e), s);
    const body = s.body.kind === 'block' ? s.body.items : [s.body];
    const consts = new Map();
    let start = body.findIndex((x) => x.kind === 'case' && constValue(x.value, consts) === v);
    if (start < 0) start = body.findIndex((x) => x.kind === 'default');
    if (start < 0) return undefined;
    const f = this.frames.at(-1);
    f.scopes.push(new Map());
    try {
      for (let k = start; k < body.length; k++) {
        const r = this.stmt(body[k]);
        if (r === BREAK) return undefined;
        if (r !== undefined) return r;
      }
    } finally { f.scopes.pop(); }
    return undefined;
  }
}
Object.assign(Machine.prototype, exprMethods, libMethods);
