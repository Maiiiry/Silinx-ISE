// Silinx ASM charts - the expressions in VHDL and Verilog (#405: out of core/asm.js): their typing and emission in
// VHDL (also the strict semantic checker: widths, numeric_std, booleans) and their emission in Verilog.
import {
  bitlen, bits, isAtom, stripParens
} from './asm.js';

// ---------------------------------------------------------------------------------------
// VHDL expression typing / emission (also used as the strict semantic checker)
// ---------------------------------------------------------------------------------------
// Typed fragment: { t: 'bool'|'sl'|'slv'|'uns'|'lit'|'int', c?: code, w?: width, v?: BigInt }
//   'int' is a VHDL integer expression made of generics and unsized literals (32 bits in Verilog).

const ARITH_OPS = new Set(['+', '-', '&', '|', '^']);
const SHIFT_OPS = new Set(['<<', '>>']);
const CMP_OPS = new Set(['==', '!=', '<', '>', '<=', '>=']);
// operators whose result depends on the width they are evaluated at (Verilog context width)
const CMP_SENSITIVE = new Set(['+', '-', '<<', '>>', '~', 'neg']);
const ASSIGN_SENSITIVE = new Set(['>>']);

/** Verilog self-determined width (unsized literals and generics are 32 bits). */
function vlSelfWidth(ast, peek) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': { const s = peek(ast.name); return !s ? 1 : s.kind === 'generic' ? 32 : s.width; }
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : vlSelfWidth(ast.a, peek);
    case 'bin':
      if (ARITH_OPS.has(ast.op)) return Math.max(vlSelfWidth(ast.a, peek), vlSelfWidth(ast.b, peek));
      if (SHIFT_OPS.has(ast.op)) return vlSelfWidth(ast.a, peek);
      return 1;
  }
  return 1;
}

/** True if an operator of `ops` is reached through context-determined operands of `ast`. */
function ctxSensitive(ast, ops) {
  if (ast.k === 'un') return ast.op !== '!' && (ops.has(ast.op === '-' ? 'neg' : ast.op) || ctxSensitive(ast.a, ops));
  if (ast.k !== 'bin') return false;
  if (ops.has(ast.op)) return true;
  if (ARITH_OPS.has(ast.op)) return ctxSensitive(ast.a, ops) || ctxSensitive(ast.b, ops);
  if (SHIFT_OPS.has(ast.op)) return ctxSensitive(ast.a, ops);
  return false;
}

const isConst = (x) => x.t === 'lit' || x.t === 'int';

function vhSlLit(x, ctx) {
  if (x.t === 'int') { ctx.error(`generic '${x.c}' cannot be used as a 1-bit value`); return "'0'"; }
  if (x.v > 1n) ctx.error(`literal ${x.v} does not fit in 1 bit`);
  return x.v === 0n ? "'0'" : "'1'";
}
function vhNat(v, w) {
  if (v < 2n ** 31n) return v.toString();
  return `unsigned'("${bits(v, Math.max(w || 1, bitlen(v)))}")`;
}
/** A constant operand as a VHDL integer expression. */
const vhInt = (x) => (x.t === 'int' ? x.c : vhNat(x.v, 32));
export function vhBool(x) {
  switch (x.t) {
    case 'bool': return x.c;
    case 'sl': return `(${x.c} = '1')`;
    case 'slv': return `(unsigned(${x.c}) /= 0)`;
    case 'uns': return `(${x.c} /= 0)`;
    case 'int': return `(${x.c} /= 0)`;
    case 'lit': return x.v !== 0n ? 'true' : 'false';
  }
  return 'false';
}
function vhUns(x, W, ctx) {
  switch (x.t) {
    case 'slv': return `unsigned(${x.c})`;
    case 'uns': return x.c;
    case 'sl': return `unsigned'(0 => ${x.c})`;
    case 'lit': return vhNat(x.v, W);
    case 'int': return x.c;
    default: ctx.error('a boolean (comparison) cannot be used as a number; use it as a condition instead'); return '0';
  }
}
function vhUnsW(x, W, ctx) { // unsigned of exactly W bits
  if (x.t === 'lit') return x.v < 2n ** 31n ? `to_unsigned(${x.v}, ${W})` : `unsigned'("${bits(x.v, W)}")`;
  if (x.t === 'int') return `to_unsigned(${stripParens(x.c)}, ${W})`;
  const u = vhUns(x, W, ctx);
  return x.w === W ? u : `resize(${u}, ${W})`;
}
/** Shift amount (a natural). */
function vhCount(x, ctx) {
  switch (x.t) {
    case 'lit':
      if (x.v >= 2n ** 31n) { ctx.error(`shift amount ${x.v} is too large`); return '0'; }
      return x.v.toString();
    case 'int': return stripParens(x.c);
    case 'sl': return `to_integer(unsigned'(0 => ${x.c}))`;
    case 'slv': return `to_integer(unsigned(${x.c}))`;
    case 'uns': return `to_integer(${x.c})`;
  }
  ctx.error('a boolean cannot be used as a shift amount');
  return '0';
}

/**
 * Width at which Verilog evaluates `ast` when it is used as a truth value (a decision, an
 * operand of ! && ||): its self-determined width, which counts unsized literals and generics
 * as 32 bits. Only matters when arithmetic, shifts or ~ are reached.
 */
function truthWidth(ast, ctx) {
  return ctxSensitive(ast, CMP_SENSITIVE) ? vlSelfWidth(ast, ctx.peek) : 0;
}
/** `ast` used as a truth value (VHDL typed fragment). */
export function vhTruth(ast, ctx) {
  const saved = ctx.targetW;
  ctx.targetW = truthWidth(ast, ctx);
  const x = vhExpr(ast, ctx);
  ctx.targetW = saved;
  return x;
}
/** True for a 1-bit operand (std_logic or the literal 0 or 1). */
const oneBit = (x) => x.t === 'sl' || (x.t === 'lit' && x.v <= 1n && (x.w == null || x.w === 1));

export function vhExpr(ast, ctx) {
  switch (ast.k) {
    case 'lit': return { t: 'lit', v: ast.v, w: ast.w };
    case 'id': {
      const s = ctx.lookup(ast.name);
      if (!s) return { t: 'sl', c: ast.name, w: 1 };
      if (s.kind === 'generic') return { t: 'int', c: s.name, w: 32 };
      const c = s.sig;
      ctx.reads.add(c);
      return s.width === 1 ? { t: 'sl', c, w: 1 } : { t: 'slv', c, w: s.width };
    }
    case 'sel': {
      const s = ctx.lookup(ast.name);
      const w = ast.hi - ast.lo + 1;
      if (!s) return w === 1 ? { t: 'sl', c: ast.name, w: 1 } : { t: 'slv', c: ast.name, w };
      if (s.kind === 'generic') { ctx.error(`generic '${ast.name}' cannot be indexed`); return { t: 'int', c: s.name, w: 32 }; }
      if (ast.hi >= s.width) ctx.error(`'${ast.name}' has ${s.width} bit${s.width === 1 ? '' : 's'} (${s.width - 1}..0): index ${ast.hi} is out of range`);
      const c = s.sig;
      ctx.reads.add(c);
      if (s.width === 1) return { t: 'sl', c, w: 1 };
      return w === 1 ? { t: 'sl', c: `${c}(${ast.hi})`, w: 1 } : { t: 'slv', c: `${c}(${ast.hi} downto ${ast.lo})`, w };
    }
    case 'un': {
      const saved = ctx.targetW;
      if (ast.op === '!') return { t: 'bool', c: `(not ${vhBool(vhTruth(ast.a, ctx))})` };
      const a = vhExpr(ast.a, ctx);
      ctx.targetW = saved;
      if (a.t === 'int') { ctx.error(`'${ast.op}' cannot be applied to a generic`); return a; }
      if (ast.op === '~') {
        if (a.t === 'lit') {
          if (a.w == null) { ctx.error('~ needs a sized literal (e.g. ~4\'b0011)'); return a; }
          return { t: 'lit', v: (~a.v) & ((1n << BigInt(a.w)) - 1n), w: a.w };
        }
        // Verilog extends the 1-bit truth value to the context width before inverting it,
        // which a VHDL boolean cannot express
        if (a.t === 'bool' && saved > 1) { ctx.error(`'~' cannot invert a comparison inside a ${saved}-bit expression (the result would be ${saved} bits wide); use '!' for a true/false value`); return a; }
        // Verilog extends the operand to the context width before inverting it
        if (a.t !== 'bool' && saved > a.w) return { t: 'uns', c: `(not ${vhUnsW(a, saved, ctx)})`, w: saved };
        return { ...a, c: `(not ${a.c})` };
      }
      // unary minus
      if (a.t === 'lit') { ctx.error('negative literals are not supported'); return a; }
      if (a.t === 'bool') { ctx.error('cannot negate a boolean'); return a; }
      const W = Math.max(a.w, saved || 0);
      return { t: 'uns', c: `(0 - ${vhUnsW(a, W, ctx)})`, w: W };
    }
    case 'bin': {
      const op = ast.op;
      const saved = ctx.targetW;
      if (SHIFT_OPS.has(op)) {
        // the left operand takes the context width, the shift amount is self-determined
        const a = vhExpr(ast.a, ctx);
        ctx.targetW = ctxSensitive(ast.b, CMP_SENSITIVE) ? vlSelfWidth(ast.b, ctx.peek) : 0;
        const b = vhExpr(ast.b, ctx);
        ctx.targetW = saved;
        if (a.t === 'bool' || b.t === 'bool') { ctx.error(`'${op}' cannot be applied to a boolean`); return { t: 'uns', c: '0', w: 1 }; }
        if (a.t === 'lit' && a.w == null && b.t === 'lit') {
          if (b.v > 64n) { ctx.error(`shift amount ${b.v} is too large`); return a; }
          return { t: 'lit', v: op === '<<' ? (a.v << b.v) & ((1n << 32n) - 1n) : a.v >> b.v, w: null };
        }
        const aw = a.t === 'int' || (a.t === 'lit' && a.w == null) ? 0 : a.w;
        const W = Math.max(aw, saved || 0) || 32;
        return { t: 'uns', c: `${op === '<<' ? 'shift_left' : 'shift_right'}(${vhUnsW(a, W, ctx)}, ${vhCount(b, ctx)})`, w: W };
      }
      // Verilog sizing (which the VHDL must match): + - & | ^ are evaluated at the width of
      // their context (assignment target); comparisons size their operands to the wider side
      // (only matters when an operand has arithmetic, shifts or ~); logical operators are
      // self-determined
      let cmpW = 0;
      if (CMP_OPS.has(op) && (ctxSensitive(ast.a, CMP_SENSITIVE) || ctxSensitive(ast.b, CMP_SENSITIVE))) {
        cmpW = Math.max(vlSelfWidth(ast.a, ctx.peek), vlSelfWidth(ast.b, ctx.peek));
      }
      if (op === '&&' || op === '||') {
        // logical operators are self-determined: each operand is a truth value of its own
        const a = vhTruth(ast.a, ctx), b = vhTruth(ast.b, ctx);
        return { t: 'bool', c: `(${vhBool(a)} ${op === '&&' ? 'and' : 'or'} ${vhBool(b)})` };
      }
      if (!ARITH_OPS.has(op)) ctx.targetW = cmpW;
      const a = vhExpr(ast.a, ctx), b = vhExpr(ast.b, ctx);
      ctx.targetW = saved;
      if (op === '&' || op === '|' || op === '^') {
        const vop = { '&': 'and', '|': 'or', '^': 'xor' }[op];
        if (a.t === 'bool' || b.t === 'bool') {
          // a comparison is a 1-bit value in Verilog: with another 1-bit operand the VHDL
          // boolean operator gives the same bit; a wider operand would keep its upper bits
          const o = a.t === 'bool' ? b : a;
          if (o.t !== 'bool' && !oneBit(o)) ctx.error(`'${op}' cannot combine a comparison (1 bit) with a ${o.t === 'int' ? 'generic' : o.w ? `${o.w}-bit value` : 'multi-bit value'}; use && / || or compare the value first (e.g. x != 0)`);
          return { t: 'bool', c: `(${vhBool(a)} ${vop} ${vhBool(b)})` };
        }
        if ((a.t === 'int' || b.t === 'int') && isConst(a) && isConst(b)) {
          ctx.error(`'${op}' cannot combine generics and literals only (use a register or a sized literal)`);
          return { t: 'lit', v: 0n, w: null };
        }
        if (a.t === 'lit' && b.t === 'lit') {
          const v = op === '&' ? a.v & b.v : op === '|' ? a.v | b.v : a.v ^ b.v;
          // an unsized literal is 32 bits wide in Verilog: the result is unsized as well
          return { t: 'lit', v, w: a.w != null && b.w != null ? Math.max(a.w, b.w) : null };
        }
        const ws = [a, b].filter((x) => !isConst(x)).map((x) => x.w);
        const lw = [a, b].filter((x) => x.t === 'lit').map((x) => x.w ?? bitlen(x.v));
        // generics are 32 bits wide: keep all of their bits unless the context is narrower
        const ints = saved ? [] : [a, b].filter((x) => x.t === 'int').map(() => 32);
        const W = Math.max(...ws, ...lw, saved || 0, ...ints);
        if (W === 1) {
          const s = (x) => (isConst(x) ? vhSlLit(x, ctx) : x.c);
          return { t: 'sl', c: `(${s(a)} ${vop} ${s(b)})`, w: 1 };
        }
        if (a.t === 'slv' && b.t === 'slv' && a.w === W && b.w === W) return { t: 'slv', c: `(${a.c} ${vop} ${b.c})`, w: W };
        return { t: 'uns', c: `(${vhUnsW(a, W, ctx)} ${vop} ${vhUnsW(b, W, ctx)})`, w: W };
      }
      if (op === '+' || op === '-') {
        if (a.t === 'bool' || b.t === 'bool') { ctx.error(`'${op}' cannot be applied to a boolean`); return { t: 'uns', c: '0', w: 1 }; }
        if (a.t === 'lit' && b.t === 'lit') {
          const v = op === '+' ? a.v + b.v : a.v - b.v;
          if (v < 0n) ctx.error('negative constant result');
          return { t: 'lit', v: v < 0n ? 0n : v, w: null };
        }
        if (isConst(a) && isConst(b)) return { t: 'int', c: `(${vhInt(a)} ${op} ${vhInt(b)})`, w: 32 };
        const ints = saved ? [] : [a, b].filter((x) => x.t === 'int').map(() => 32);
        const W = Math.max(...[a, b].filter((x) => !isConst(x)).map((x) => x.w), saved || 0, ...ints);
        const opnd = (x) => (isConst(x) ? vhUns(x, W, ctx) : vhUnsW(x, W, ctx));
        return { t: 'uns', c: `(${opnd(a)} ${op} ${opnd(b)})`, w: W };
      }
      // comparisons
      const vop = { '==': '=', '!=': '/=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' }[op];
      if (a.t === 'bool' || b.t === 'bool') {
        if (op !== '==' && op !== '!=') { ctx.error(`'${op}' cannot compare booleans`); return { t: 'bool', c: 'false' }; }
        const [bo, o] = a.t === 'bool' ? [a, b] : [b, a];
        if (o.t === 'bool' || oneBit(o)) return { t: 'bool', c: `(${vhBool(a)} ${vop} ${vhBool(b)})` };
        // Verilog compares the value with the zero-extended truth bit (0 or 1)
        let eq;
        if (o.t === 'lit') eq = o.v === 0n ? `(not ${bo.c})` : o.v === 1n ? bo.c : 'false';
        else {
          const u = o.t === 'int' ? o.c : vhUns(o, o.w, ctx);
          eq = `((${u} = 1 and ${bo.c}) or (${u} = 0 and not ${bo.c}))`;
        }
        if (op === '==') return { t: 'bool', c: eq };
        return { t: 'bool', c: eq === 'false' ? 'true' : `(not ${eq})` };
      }
      if (a.t === 'lit' && b.t === 'lit') {
        const r = { '==': a.v === b.v, '!=': a.v !== b.v, '<': a.v < b.v, '>': a.v > b.v, '<=': a.v <= b.v, '>=': a.v >= b.v }[op];
        return { t: 'bool', c: r ? 'true' : 'false' };
      }
      if (isConst(a) && isConst(b)) return { t: 'bool', c: `(${vhInt(a)} ${vop} ${vhInt(b)})` };
      if (oneBit(a) && oneBit(b)) {
        const s = (x) => (x.t === 'lit' ? vhSlLit(x, ctx) : x.c);
        return { t: 'bool', c: `(${s(a)} ${vop} ${s(b)})` };
      }
      const W = Math.max(...[a, b].filter((x) => x.t !== 'lit').map((x) => x.w));
      for (const x of [a, b]) if (x.t === 'lit' && bitlen(x.v) > W) ctx.warn(`literal ${x.v} is wider than the ${W}-bit operand it is compared with`);
      return { t: 'bool', c: `(${vhUns(a, W, ctx)} ${vop} ${vhUns(b, W, ctx)})` };
    }
  }
  return { t: 'lit', v: 0n, w: null };
}

function vhOne(w) { return w === 1 ? "'1'" : `"${bits(1n, w)}"`; }
function vhZero(w) { return w === 1 ? "'0'" : `"${'0'.repeat(w)}"`; }
export function vhLitW(v, w) { return w === 1 ? (v & 1n ? "'1'" : "'0'") : `"${bits(v, w)}"`; }

/** VHDL statements assigning `ast` to signal `sig` of width `w`. */
export function vhAssign(sig, w, ast, ctx) {
  // a right shift sees the bits above the target: evaluate at the full Verilog context width
  const wide = ctxSensitive(ast, ASSIGN_SENSITIVE) ? Math.max(w, vlSelfWidth(ast, ctx.peek)) : w;
  ctx.targetW = wide;
  const x = vhExpr(ast, ctx);
  ctx.targetW = 0;
  switch (x.t) {
    case 'lit':
      if (bitlen(x.v) > w) ctx.warn(`value ${x.v} is truncated to ${w} bit(s)`);
      return [{ s: 'raw', text: `${sig} <= ${vhLitW(x.v, w)};` }];
    case 'int':
      if (w === 1) { ctx.error('cannot assign an integer (generic) expression to a 1-bit target'); return []; }
      return [{ s: 'raw', text: `${sig} <= std_logic_vector(to_unsigned(${stripParens(x.c)}, ${w}));` }];
    case 'sl':
      return [{ s: 'raw', text: `${sig} <= ${w === 1 ? stripParens(x.c) : `(0 => ${x.c}, others => '0')`};` }];
    case 'slv':
      if (w === 1) { ctx.error(`cannot assign a ${x.w}-bit value to a 1-bit target; compare it instead (e.g. x /= 0)`); return []; }
      if (x.w > w) ctx.warn(`${x.w}-bit value is truncated to ${w} bits`);
      return [{ s: 'raw', text: `${sig} <= ${x.w === w ? stripParens(x.c) : `std_logic_vector(resize(unsigned(${x.c}), ${w}))`};` }];
    case 'uns':
      if (w === 1) { ctx.error(`cannot assign a ${x.w}-bit arithmetic result to a 1-bit target; compare it instead`); return []; }
      if (x.w > w && x.w > wide) ctx.warn(`${x.w}-bit value is truncated to ${w} bits`);
      return [{ s: 'raw', text: `${sig} <= std_logic_vector(${x.w === w ? stripParens(x.c) : `resize(${x.c}, ${w})`});` }];
    case 'bool':
      return [{ s: 'if', cond: stripParens(x.c), then: [{ s: 'raw', text: `${sig} <= ${vhOne(w)};` }],
        else: [{ s: 'raw', text: `${sig} <= ${vhZero(w)};` }] }];
  }
  return [];
}

export function vhNot(c) {
  let m;
  if ((m = /^([A-Za-z_][A-Za-z0-9_]*) = '([01])'$/.exec(c))) return `${m[1]} = '${m[2] === '1' ? '0' : '1'}'`;
  if ((m = /^not \((.*)\)$/.exec(c)) && stripParens(`(${m[1]})`) === m[1]) return m[1];
  return `not (${c})`;
}

// ---------------------------------------------------------------------------------------
// Verilog expression emission
// ---------------------------------------------------------------------------------------

function vlLit(l) {
  if (l.w == null) return l.v.toString();
  if (l.base === 'h') return `${l.w}'h${l.v.toString(16).toUpperCase()}`;
  if (l.base === 'd' || l.base === 'o') return `${l.w}'d${l.v}`;
  return `${l.w}'b${bits(l.v, l.w)}`;
}
export function vlLitW(v, w, base) {
  if (w === 1) return `1'b${v & 1n}`;
  const mv = v & ((1n << BigInt(w)) - 1n);
  if (base === 'b') return `${w}'b${bits(mv, w)}`;
  if (base === 'h') return `${w}'h${mv.toString(16).toUpperCase()}`;
  return `${w}'d${mv}`;
}
export function vlExpr(ast, ctx) {
  switch (ast.k) {
    case 'lit': return vlLit(ast);
    case 'id': {
      const s = ctx.lookup(ast.name);
      if (s?.kind === 'generic') return s.name;
      const c = s ? s.sig : ast.name;
      ctx.reads.add(c);
      return c;
    }
    case 'sel': {
      const s = ctx.lookup(ast.name);
      if (s?.kind === 'generic') return s.name;
      const c = s ? s.sig : ast.name;
      ctx.reads.add(c);
      if (s && s.width === 1) return c;
      return ast.hi === ast.lo ? `${c}[${ast.hi}]` : `${c}[${ast.hi}:${ast.lo}]`;
    }
    case 'un': {
      const a = vlExpr(ast.a, ctx);
      return `${ast.op}${isAtom(a) || a.startsWith('(') ? a : `(${a})`}`;
    }
    case 'bin': return `(${vlExpr(ast.a, ctx)} ${ast.op} ${vlExpr(ast.b, ctx)})`;
  }
  return '0';
}
export function vlNot(c) {
  if (isAtom(c)) return `!${c}`;
  let m;
  if ((m = /^!(.*)$/.exec(c)) && (isAtom(m[1]) || stripParens(m[1]) !== m[1])) return stripParens(m[1]);
  return `!(${c})`;
}
export function vlAssign(sig, w, ast, ctx) {
  if (ast.k === 'lit') return [{ s: 'raw', text: `${sig} = ${vlLitW(ast.v, w, ast.base)};` }];
  return [{ s: 'raw', text: `${sig} = ${stripParens(vlExpr(ast, ctx))};` }];
}
