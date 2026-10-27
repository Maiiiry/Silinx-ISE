// Silinx C (#1528): the expressions of the C simulation (core/c-interp.js's methods, mixed into its Machine): C's and
// ap_int's arithmetic on BigInt values (core/c-types.js), pointers to variables and array elements, printf.
// Isomorphic ES module: no DOM and no Node APIs.
import { INT, BOOL, typeOf, promote, binaryType, compareType, shiftType, unaryType, literalType, wrap } from './c-types.js';

const CMP = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };

/** v as a value of type t: C's conversion (to bool: 0 or 1; else the bits of the width, read signed or not). */
export function convert(v, t) {
  if (t.bool) return v ? 1n : 0n;
  return wrap(v, t);
}
const num = (v, t) => ({ v: convert(v, t), t });

export const exprMethods = {
  /** The value of an expression: { v, t } (an integer), { ptr, t } (a pointer: get / set), { arr, t } (an array). */
  eval(e) {
    this.tick(e);
    switch (e.kind) {
      case 'num': return num(e.value, literalType(e.value, { unsigned: e.unsigned, long: e.long, decimal: !/^0/.test(e.text) || e.text === '0' }));
      case 'chr': return num(e.value, INT);
      case 'str': return { str: e.value };
      case 'id': {
        const c = this.lookup(e.name, e);
        if (c.isFile) return { fh: c.fh, v: c.fh ? 1n : 0n, t: c.t };   // (a FILE *: 0 when NULL, #1598)
        if (c.fifo) return { fifo: c.fifo, t: c.t };   // (an hls::stream, #1590)
        if (c.arr) return { arr: c.arr, t: c.t, dims: c.dims };
        if (c.ref) return { ptr: c.ref, t: c.t };
        return { v: c.v, t: c.t };
      }
      case 'unary': return this.unary(e);
      case 'postfix': {
        const ref = this.lvalue(e.e);
        const old = ref.get();
        ref.set(this.arith(e.op === '++' ? '+' : '-', old, num(1n, INT), e));
        return old;
      }
      case 'binary': return this.binary(e);
      case 'assign': {
        const ref = this.lvalue(e.l);
        const val = e.op === '=' ? this.eval(e.r) : this.arith(e.op.slice(0, -1), ref.get(), this.eval(e.r), e);
        ref.set(val);
        return ref.get();
      }
      case 'cond': {
        const c = this.truth(this.eval(e.c));
        // (the result in the common type of both branches, as C converts them)
        const a = c ? this.eval(e.a) : null, b = c ? null : this.eval(e.b);
        const other = this.typeOfExpr(c ? e.b : e.a);
        const x = a || b;
        if (x.ptr || x.arr || !other) return x;
        const t = compareType(x.t, other);
        return num(x.v, t);
      }
      case 'comma': this.eval(e.l); return this.eval(e.r);
      case 'cast': {
        const t = typeOf(e.type);
        const x = this.eval(e.e);
        if (!t) return x;
        return num(this.intOf(x, e), t);
      }
      case 'call': return this.call(e);
      case 'index': {
        // (a row of an array of arrays: a view of its cells)
        const r = this.indexRef(e);
        return r.row || r.get();
      }
      case 'sizeof': {
        const t = e.type ? typeOf(e.type) : this.typeOfExpr(e.e);
        const n = e.type?.kind === 'array' ? (e.type.length || 1) : 1;
        return num(BigInt(Math.ceil((t?.w || 32) / 8) * n), { w: 64, s: false, ap: false });
      }
      default: this.fail(e, `this expression cannot be simulated`);
    }
    return null;
  },
  /** The type of an expression without running it (for ?:'s common type), or null. */
  typeOfExpr(e) {
    if (e.kind === 'num') return literalType(e.value, { unsigned: e.unsigned, long: e.long });
    if (e.kind === 'id') { const c = this.find(e.name); return c && !c.arr && !c.ref ? c.t : null; }
    if (e.kind === 'cast') return typeOf(e.type);
    return null;
  },
  intOf(x, e) {
    if (x.v !== undefined) return x.v;
    this.fail(e, 'an integer expected here (not a pointer or an array)');
    return 0n;
  },
  truth(x) { return x.ptr ? true : this.intOf(x) !== 0n; },
  unary(e) {
    switch (e.op) {
      case '!': return num(this.truth(this.eval(e.e)) ? 0n : 1n, INT);
      case '-': case '+': case '~': {
        const x = this.eval(e.e);
        const t = unaryType(e.op, x.t);
        const v = convert(this.intOf(x, e), t);
        return num(e.op === '-' ? -v : e.op === '~' ? ~v : v, t);
      }
      case '*': { const p = this.eval(e.e); if (!p.ptr) this.fail(e, "'*' of something that is not a pointer"); return p.ptr.get(); }
      case '&': return { ptr: this.lvalue(e.e), t: this.lvalue(e.e).t };
      case '++': case '--': {
        const ref = this.lvalue(e.e);
        ref.set(this.arith(e.op === '++' ? '+' : '-', ref.get(), num(1n, INT), e));
        return ref.get();
      }
      default: this.fail(e, `the operator '${e.op}' cannot be simulated`);
    }
    return null;
  },
  binary(e) {
    if (e.op === '&&') return num(this.truth(this.eval(e.l)) && this.truth(this.eval(e.r)) ? 1n : 0n, INT);
    if (e.op === '||') return num(this.truth(this.eval(e.l)) || this.truth(this.eval(e.r)) ? 1n : 0n, INT);
    const l = this.eval(e.l), r = this.eval(e.r);
    if (CMP[e.op]) {
      const t = compareType(l.t, r.t);
      return num(CMP[e.op](convert(this.intOf(l, e), t), convert(this.intOf(r, e), t)) ? 1n : 0n, INT);
    }
    return this.arith(e.op, l, r, e);
  },
  /** l op r with C's / ap_int's arithmetic: + - * / % & | ^ << >> */
  arith(op, l, r, e) {
    const a0 = this.intOf(l, e), b0 = this.intOf(r, e);
    if (op === '<<' || op === '>>') {
      const t = shiftType(l.t);
      const a = convert(a0, t);
      if (b0 < 0n || (!t.ap && b0 >= BigInt(t.w))) this.fail(e, `a shift by ${b0} of a ${t.w}-bit value is undefined in C`);
      return num(op === '<<' ? a << b0 : a >> b0, t);
    }
    const { res, opnd } = binaryType(op, l.t, r.t);
    const a = convert(a0, opnd), b = convert(b0, opnd);
    let v;
    switch (op) {
      case '+': v = a + b; break;
      case '-': v = a - b; break;
      case '*': v = a * b; break;
      case '/': if (!b) this.fail(e, 'division by zero'); v = a / b; break;
      case '%': if (!b) this.fail(e, 'division by zero'); v = a % b; break;
      case '&': v = a & b; break;
      case '|': v = a | b; break;
      case '^': v = a ^ b; break;
      default: this.fail(e, `the operator '${op}' cannot be simulated`);
    }
    return num(convert(v, opnd), res);
  },
  /** An hls::stream's member function (#1590): read() / read(x), write(v), empty(), full(), size(), read_nb(x),
   *  write_nb(v); a read of an empty stream stops the run (it would wait for ever in hardware). */
  streamOp(f, name, e) {
    const B = (b) => num(b ? 1n : 0n, INT);
    const take = () => { const v = f.q.shift(); if (f.log) f.log.reads++; return num(v, f.t); };
    const put = (x) => { const v = convert(this.intOf(x, e), f.t); f.q.push(v); f.log?.writes.push(v); };
    switch (name) {
      case 'read': {
        if (!f.q.length) this.fail(e, `the stream '${f.name}' is read while empty`);
        const v = take();
        if (e.args[0]) this.lvalue(e.args[0]).set(v);
        return v;
      }
      case 'read_nb': {
        if (!f.q.length) return B(false);
        this.lvalue(e.args[0]).set(take());
        return B(true);
      }
      case 'write': case 'write_nb': put(this.eval(e.args[0])); return name === 'write' ? num(0n, INT) : B(true);
      case 'empty': return B(!f.q.length);
      case 'full': return B(false);
      case 'size': return num(BigInt(f.q.length), INT);
      default: this.fail(e, `'.${name}' of a stream cannot be simulated`);
    }
    return null;
  },
  /** The place an lvalue names: { get(), set(value), t }. */
  lvalue(e) {
    if (e.kind === 'id') {
      const c = this.lookup(e.name, e);
      if (c.arr) this.fail(e, `'${e.name}' is an array: give an index`);
      if (c.isFile) return { get: () => ({ fh: c.fh, v: c.fh ? 1n : 0n, t: c.t }), set: (x) => { c.fh = x.fh ?? null; }, t: c.t };
      if (c.ref) return { get: () => ({ ptr: c.ref, t: c.t }), set: (x) => { if (!x.ptr) this.fail(e, `'${e.name}' is a pointer`); c.ref = x.ptr; }, t: c.t };
      return { get: () => ({ v: c.v, t: c.t }), set: (x) => { c.v = convert(this.intOf(x, e), c.t); }, t: c.t };
    }
    if (e.kind === 'unary' && e.op === '*') { const p = this.eval(e.e); if (!p.ptr) this.fail(e, "'*' of something that is not a pointer"); return p.ptr; }
    if (e.kind === 'index') return this.indexRef(e);
    this.fail(e, 'this cannot be assigned');
    return null;
  },
  /** a[i]: an array's element, a pointer's (p[0], or an element of the array it points into), an ap_int's bit. */
  indexRef(e) {
    const base = this.eval(e.e);
    const i = Number(this.intOf(this.eval(e.i), e));
    if (base.arr && base.dims?.length > 1) {
      const stride = base.dims.slice(1).reduce((a, b) => a * b, 1);
      if (i < 0 || i >= base.dims[0]) this.fail(e, `the index ${i} is outside the array (0 to ${base.dims[0] - 1})`);
      const row = { arr: base.arr.slice(i * stride, (i + 1) * stride), t: base.t, dims: base.dims.slice(1) };
      return { row, get: () => row, set: () => this.fail(e, 'a row of an array cannot be assigned'), t: base.t };
    }
    if (base.arr) {
      if (i < 0 || i >= base.arr.length) this.fail(e, `the index ${i} is outside the array (0 to ${base.arr.length - 1})`);
      const cell = base.arr[i];
      return { get: () => ({ v: cell.v, t: base.t }), set: (x) => { cell.v = convert(this.intOf(x, e), base.t); }, t: base.t, cell, arr: base.arr, index: i };
    }
    if (base.ptr) {
      if (base.ptr.arr) {
        const k = base.ptr.index + i;
        if (k < 0 || k >= base.ptr.arr.length) this.fail(e, `the index ${i} is outside the array the pointer points into`);
        const cell = base.ptr.arr[k];
        return { get: () => ({ v: cell.v, t: base.t }), set: (x) => { cell.v = convert(this.intOf(x, e), base.t); }, t: base.t, cell, arr: base.ptr.arr, index: k };
      }
      if (i !== 0) this.fail(e, `a pointer to one value: only [0]`);
      return base.ptr;
    }
    // a bit of an ap_int / ap_uint
    if (!base.t?.ap) this.fail(e, 'an index of a value that is not an array');
    if (i < 0 || i >= base.t.w) this.fail(e, `the bit ${i} is outside the ${base.t.w} bits of this value`);
    const target = e.e.kind === 'id' ? this.lvalue(e.e) : null;
    return {
      get: () => num((convert(base.v, { ...base.t, s: false }) >> BigInt(i)) & 1n, BOOL),
      set: (x) => {
        if (!target) this.fail(e, 'this bit cannot be assigned');
        const cur = convert(target.get().v, { ...base.t, s: false });
        const bit = this.truth(x) ? 1n : 0n;
        target.set(num((cur & ~(1n << BigInt(i))) | (bit << BigInt(i)), base.t));
      },
      t: BOOL,
    };
  },
  /** printf's formatting: %[flags][width][.precision][length]conversion (d i u x X o c s p %). */
  format(fmt, args, e) {
    let k = 0, out = '';
    const next = () => { if (k >= args.length) this.fail(e, 'printf: fewer arguments than its format asks for'); return args[k++]; };
    const re = /%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|z|j)?([diuxXocsp%])/g;
    let last = 0, m;
    while ((m = re.exec(fmt))) {
      out += fmt.slice(last, m.index);
      last = re.lastIndex;
      let [, flags, width, prec, len, conv] = m;
      if (conv === '%') { out += '%'; continue; }
      if (width === '*') width = String(this.intOf(next(), e));
      if (prec === '*') prec = String(this.intOf(next(), e));
      const a = next();
      let s;
      if (conv === 's') { s = a.str ?? ''; if (prec !== undefined) s = s.slice(0, Number(prec)); }
      else if (conv === 'c') s = String.fromCharCode(Number(convert(this.intOf(a, e), { w: 8, s: false })));
      else if (conv === 'p') s = '0x1';
      else {
        const w = len === 'hh' ? 8 : len === 'h' ? 16 : len === 'l' || len === 'll' || len === 'z' || len === 'j' ? 64 : 32;
        const signed = conv === 'd' || conv === 'i';
        let v = convert(this.intOf(a, e), { w, s: signed });
        const neg = v < 0n;
        if (neg) v = -v;
        s = v.toString(conv === 'o' ? 8 : conv === 'x' || conv === 'X' ? 16 : 10);
        if (conv === 'X') s = s.toUpperCase();
        if (prec !== undefined) s = s.padStart(Number(prec), '0');
        if (flags.includes('#') && v && (conv === 'x' || conv === 'X')) s = `0${conv}${s}`;
        if (flags.includes('#') && conv === 'o' && s[0] !== '0') s = `0${s}`;
        const sign = neg ? '-' : signed && flags.includes('+') ? '+' : signed && flags.includes(' ') ? ' ' : '';
        if (flags.includes('0') && !flags.includes('-') && prec === undefined && width) s = s.padStart(Number(width) - sign.length, '0');
        s = sign + s;
      }
      if (width) s = flags.includes('-') ? s.padEnd(Number(width)) : s.padStart(Number(width));
      out += s;
    }
    return out + fmt.slice(last);
  },
  member(e) {
    const m = e.callee;
    const x = this.eval(m.e);
    if (x.fifo) return this.streamOp(x.fifo, m.name, e);
    const args = e.args.map((a) => Number(this.intOf(this.eval(a), a)));
    const u = () => convert(x.v, { ...x.t, s: false });
    switch (m.name) {
      case 'range': {
        const [hi, lo] = args;
        if (lo < 0 || hi >= x.t.w || hi < lo) this.fail(e, `.range(${hi}, ${lo}) is outside the ${x.t.w} bits of this value`);
        return num((u() >> BigInt(lo)) & ((1n << BigInt(hi - lo + 1)) - 1n), { w: hi - lo + 1, s: false, ap: true });
      }
      case 'to_int': return num(x.v, INT);
      case 'to_uint': return num(x.v, { w: 32, s: false, ap: false });
      case 'to_long': case 'to_int64': return num(x.v, { w: 64, s: true, ap: false });
      case 'to_ulong': case 'to_uint64': return num(x.v, { w: 64, s: false, ap: false });
      case 'length': return num(BigInt(x.t.w), INT);
      case 'or_reduce': return num(u() ? 1n : 0n, BOOL);
      case 'and_reduce': return num(u() === (1n << BigInt(x.t.w)) - 1n ? 1n : 0n, BOOL);
      case 'xor_reduce': return num(BigInt([...u().toString(2)].filter((d) => d === '1').length % 2), BOOL);
      default: this.fail(e, `'.${m.name}()' cannot be simulated`);
    }
    return null;
  },
};

export { promote };
