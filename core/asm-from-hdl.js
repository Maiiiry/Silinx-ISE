// Silinx - recover an ASM chart from a VHDL/Verilog finite state machine.
//
// Isomorphic ES module: no DOM and no Node APIs.
//
//   asmFromHdl(source, { path, module, lang, previous }) -> { model, warnings }
//       Parse one HDL file and rebuild the ASM chart (see core/asm.js for the model) of the
//       state machine described by `module` (default: the first module/entity of the file).
//       Throws an Error whose message says, in user terms, why the module is not a pure state
//       machine (e.g. "process at line 40 is not part of the state machine").
//       `previous` (optional) is an existing chart of the same machine: its node ids, positions,
//       edge points, texts (conditions/actions written differently but meaning the same),
//       output defaults, encoding and name are kept wherever the extracted machine matches.
//   asmLayout(model)            -> copy of the model with x/y assigned (top-down layout)
//   sameAsmStructure(a, b)      -> true if both charts describe the same machine (positions,
//                                  ids and the spelling of equivalent expressions ignored)
//
// What is recognised (VHDL and Verilog):
//   * everything generateVhdl/generateVerilog (core/asm.js) produce, for all encodings;
//     regenerating from the extracted chart reproduces the file exactly (the generator header
//     is used to recover the original spelling of conditions/actions, the description and
//     the encoding);
//   * hand-written 1-, 2- and 3-process machines: a clocked process with an asynchronous or
//     synchronous reset (active high or low) that loads the state register (from a next-state
//     signal, or directly from a `case` on the state = 1-process style), combinational
//     processes with `case`/`if` on the state, concurrent `o <= '1' when state = S else '0'`
//     / `assign o = (state == S)` outputs and `with state select` assignments; VHDL enum
//     state types, VHDL constants and Verilog parameter/localparam state codes;
//   * if/elsif/else chains and nested ifs on inputs become decision boxes (one per condition,
//     an elsif chain is a chain of decisions on the false branch); `case` on an input, a
//     register or a bit selection of one with constant choices becomes a case box (other
//     `case` statements become a chain of decisions, `sel == 2'b01`); bit and slice
//     selections (`op[3]`, `op(3 downto 2)`) of inputs and registers are kept as such; a VHDL
//     if/elsif chain on a slice is a case box when the generator header (or the previous
//     chart) has a case box on it; default assignments before the case become output
//     defaults; outputs assigned in the clocked process (or through `<name>_reg/_next`
//     signals) become registered outputs (ASMD semantics: they hold when not assigned).
//
// Normalisations (the extracted chart is equivalent, not always textually identical):
//   * expressions are rewritten in the ASM syntax (C-like): VHDL `x = '1'` in a condition
//     becomes `x`, `unsigned(cnt) = 9` becomes `cnt == 9`, type conversions are dropped;
//   * state names are the constant names without the `S_` prefix (VHDL enum literals as-is);
//   * unconditional assignments at the start of a state are Moore actions; assignments under
//     a condition are conditional output boxes; output defaults are inferred when the code
//     assigns an output in every state instead of giving it a default;
//   * the `when others`/`default` branch of the state case is ignored (unreachable states).

import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import {
  normalizeModel, validate, generate, parseCondition, parseAction, exprToString, extractTransitions,
  extractAlwaysBlocks, parseCaseChoices,
} from './asm.js';
import { asmLayout, nodeSize, reusePrevious, exitsOf } from './asm-layout.js';
import { lineOf, atLine, fail, stmtList, walkExpr, bitsValue, lit, evalInt } from './asm-hdl-util.js';
import { analyzeModule, parseHeader } from './asm-hdl-analysis.js';

// the layout (#405: asm-layout.js), still exported from here
export { asmLayout, nodeSize };

// ---------------------------------------------------------------------------------------
// ASM expression helpers (on core/asm.js ASTs: { k: 'id'|'lit'|'un'|'bin' })
// ---------------------------------------------------------------------------------------

const BOOL_OPS = new Set(['&&', '||', '==', '!=', '<', '>', '<=', '>=']);
const NEG_CMP = { '==': '!=', '!=': '==', '<': '>=', '>=': '<', '>': '<=', '<=': '>' };

/** True if core/asm.js types the expression as a boolean (not as a bit/vector). */
function asmIsBool(ast) {
  if (ast.k === 'un') return ast.op === '!';
  if (ast.k === 'bin') return BOOL_OPS.has(ast.op) || (['&', '|', '^'].includes(ast.op) && (asmIsBool(ast.a) || asmIsBool(ast.b)));
  return false;
}

/** True for a single bit: a 1-bit signal or a 1-bit selection (`x[3]`). */
const isBit = (ast, widthOf) => (ast.k === 'id' && widthOf(ast.name) === 1) || (ast.k === 'sel' && ast.hi === ast.lo);

/** VHDL: `x == 1` with a 1-bit x means the same as `x` where a boolean is expected. */
function simpLogical(ast, logical, widthOf) {
  if (ast.k === 'bin') {
    if (logical && ast.op === '==' && isBit(ast.a, widthOf) && ast.b.k === 'lit' && ast.b.v === 1n && (ast.b.w == null || ast.b.w === 1)) return ast.a;
    const sub = ast.op === '&&' || ast.op === '||';
    return { ...ast, a: simpLogical(ast.a, sub, widthOf), b: simpLogical(ast.b, sub, widthOf) };
  }
  if (ast.k === 'un') return { ...ast, a: simpLogical(ast.a, ast.op === '!', widthOf) };
  return ast;
}

export const valueLits = (ast) => (ast.k === 'lit' ? lit(ast.v) : ast.k === 'un' ? { ...ast, a: valueLits(ast.a) }
  : ast.k === 'bin' ? { ...ast, a: valueLits(ast.a), b: valueLits(ast.b) } : ast);

/** Canonical form used to decide that two conditions are the same (or opposite) decision. */
function canon(ast, widthOf) {
  if (ast.k === 'lit') return lit(ast.v);
  if (ast.k === 'id' || ast.k === 'sel') return ast;
  if (ast.k === 'un') {
    const a = canon(ast.a, widthOf);
    if (ast.op !== '!') return { ...ast, a };
    if (a.k === 'un' && a.op === '!') return a.a;
    if (a.k === 'bin' && NEG_CMP[a.op]) return { ...a, op: NEG_CMP[a.op] };
    return { k: 'un', op: '!', a };
  }
  let a = canon(ast.a, widthOf), b = canon(ast.b, widthOf);
  if ((ast.op === '==' || ast.op === '!=') && a.k === 'lit' && b.k !== 'lit') [a, b] = [b, a];
  if ((ast.op === '==' || ast.op === '!=') && isBit(a, widthOf) && b.k === 'lit' && b.v <= 1n) {
    const positive = (ast.op === '==') === (b.v === 1n);
    return positive ? a : { k: 'un', op: '!', a };
  }
  return { k: 'bin', op: ast.op, a, b };
}
export const condKey = (ast, widthOf) => exprToString(canon(ast, widthOf));
const condNegKey = (ast, widthOf) => exprToString(canon({ k: 'un', op: '!', a: ast }, widthOf));

// ---------------------------------------------------------------------------------------
// Specialisation of the logic for one state (partial evaluation of state comparisons)
// ---------------------------------------------------------------------------------------

const BOOL_T = { op: 'bool', v: true }, BOOL_F = { op: 'bool', v: false };

function specExpr(e, A, s, loc) {
  if (!e || typeof e !== 'object' || !e.op) return e;
  const isS = (x) => x.op === 'ref' && x.name === A.S;
  switch (e.op) {
    case 'ref':
      if (e.name === A.S) fail(`the state register '${A.orig(A.S)}' is used${atLine(loc)} in a way a chart cannot express (only comparisons with state constants and case statements are supported)`);
      return e;
    case 'binary': {
      if ((e.o === '==' || e.o === '!=') && (isS(e.a) || isS(e.b))) {
        const other = isS(e.a) ? e.b : e.a;
        const st = A.stateOfExpr(other);
        if (!st) fail(`the state register is compared${atLine(loc)} with something that is not a state`);
        return (st === s) === (e.o === '==') ? BOOL_T : BOOL_F;
      }
      const a = specExpr(e.a, A, s, loc), b = specExpr(e.b, A, s, loc);
      const isAnd = e.o === '&&' || e.o === '&', isOr = e.o === '||' || e.o === '|';
      if ((isAnd || isOr) && (a.op === 'bool' || b.op === 'bool')) {
        const [k, o] = a.op === 'bool' ? [a, b] : [b, a];
        if (isAnd) return k.v ? o : BOOL_F;
        return k.v ? BOOL_T : o;
      }
      if ((e.o === '==' || e.o === '!=') && a.op === 'bool' && b.op === 'bool') return (a.v === b.v) === (e.o === '==') ? BOOL_T : BOOL_F;
      return { ...e, a, b };
    }
    case 'unary': {
      const a = specExpr(e.a, A, s, loc);
      if (a.op === 'bool' && (e.o === '!' || e.o === '~')) return a.v ? BOOL_F : BOOL_T;
      return { ...e, a };
    }
    case 'cond': {
      const c = specExpr(e.cond, A, s, loc);
      if (c.op === 'bool') return specExpr(c.v ? e.then : e.else, A, s, loc);
      return { ...e, cond: c, then: specExpr(e.then, A, s, loc), else: specExpr(e.else, A, s, loc) };
    }
    default: {
      let bad = false;
      walkExpr(e, (x) => { if (isS(x)) bad = true; });
      if (bad) fail(`the state register '${A.orig(A.S)}' is used${atLine(loc)} in a way a chart cannot express`);
      return e;
    }
  }
}

function specStmts(list, A, s) {
  const out = [];
  for (const st of stmtList(list)) {
    switch (st.kind) {
      case 'null': break;
      case 'assign': {
        if (st.delay) fail(`assignment${atLine(st.loc)} has a delay, which a state machine chart cannot express`);
        const v = specExpr(st.value, A, s, st.loc);
        // `o <= a when c else b` / `o = c ? a : b` -> if c then o <= a else o <= b
        if (v.op === 'cond') {
          out.push(...specStmts([{ kind: 'if', cond: v.cond, fromCond: true, loc: st.loc,
            then: [{ ...st, value: v.then }], else: [{ ...st, value: v.else }] }], A, s));
        } else out.push({ ...st, value: v });
        break;
      }
      case 'if': {
        const c = specExpr(st.cond, A, s, st.loc);
        if (c.op === 'bool') out.push(...specStmts(c.v ? st.then : st.else, A, s));
        else out.push({ ...st, cond: c, then: specStmts(st.then, A, s), else: specStmts(st.else, A, s) });
        break;
      }
      case 'case': {
        if (st.variant && st.variant !== 'case') fail(`${st.variant} statement${atLine(st.loc)} is not supported (use case)`);
        if (st.expr.op === 'ref' && st.expr.name === A.S) {
          const item = st.items.find((it) => it.choices.some((ch) => !ch.range && A.stateOfExpr(ch) === s));
          for (const it of st.items) for (const ch of it.choices) {
            if (ch.range || !A.stateOfExpr(ch)) fail(`case choice${atLine(st.loc)} on the state register is not a state`);
          }
          out.push(...specStmts(item ? item.body : st.default, A, s));
        } else {
          out.push({ ...st, expr: specExpr(st.expr, A, s, st.loc),
            items: st.items.map((it) => ({ ...it, body: specStmts(it.body, A, s) })),
            default: st.default ? specStmts(st.default, A, s) : null });
        }
        break;
      }
      default:
        fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// IR expression -> ASM expression
// ---------------------------------------------------------------------------------------

const ASM_BIN = new Set(['&&', '||', '|', '^', '&', '==', '!=', '<', '>', '<=', '>=', '+', '-', '<<', '>>']);

/** A signal a chart can read (input, synchronised input, register, registered output): { name, w }. */
export function readable(n, A) {
  const r = A.roles.get(n);
  if (r?.kind === 'syncout') return { name: A.orig(r.input), w: A.widthOf(r.input) };
  if (r?.kind === 'in') return { name: A.orig(n), w: A.widthOf(n) };
  if (r?.kind === 'regcur' || r?.kind === 'regport') return { name: A.orig(r.out), w: A.outInfo.get(r.out).width };
  return null;
}

/** Bit (`left` only) or slice selection of a signal -> { k: 'sel' }. */
function convSel(n, left, right, A, X) {
  const where = `expression${atLine(X.loc)}`;
  const sig = readable(n, A);
  if (!sig) return conv({ op: 'ref', name: n }, A, X); // reports why the signal cannot be read
  const ev = (x) => (x?.k === 'lit' ? x.v : evalInt(x, A.consts));
  const l = ev(left), r = right == null ? l : ev(right);
  if (l == null || r == null) fail(`${where} selects bits of '${A.orig(n)}' with a variable index, which a chart cannot express`);
  if (!A.zeroBased(n)) fail(`${where} selects bits of '${A.orig(n)}', whose bits are not numbered ${sig.w - 1} downto 0`);
  const hi = Number(l > r ? l : r), lo = Number(l > r ? r : l);
  if (hi >= sig.w) fail(`${where} selects bit ${hi} of '${sig.name}', which has ${sig.w} bit${sig.w === 1 ? '' : 's'}`);
  const w = hi - lo + 1;
  return { ast: { k: 'sel', name: sig.name, hi, lo }, ty: w === 1 ? 'bit' : 'vec', w };
}

/** Convert an IR expression. Returns { ast, ty: 'bool'|'bit'|'vec'|'num', w }. */
function conv(e, A, X) {
  const where = `expression${atLine(X.loc)}`;
  switch (e.op) {
    case 'bool': return { ast: lit(e.v ? 1n : 0n), ty: 'bool' };
    case 'int': return { ast: lit(BigInt(e.value)), ty: 'num' };
    case 'lit': {
      const v = bitsValue(e.bits, where);
      if (A.lang === 'vhdl') {
        if (e.scalar) return { ast: lit(v), ty: 'bit', w: 1 };
        return { ast: lit(v, e.bits.length, 'b'), ty: 'vec', w: e.bits.length };
      }
      if (!e.sized) return { ast: lit(v), ty: 'num' };
      const w = e.bits.length;
      return { ast: lit(v, w, A.litBase(lineOf(X.loc), w, v)), ty: w === 1 ? 'bit' : 'vec', w };
    }
    case 'ref': {
      const n = e.name;
      if (A.lang === 'vhdl' && (n === 'true' || n === 'false')) return { ast: lit(n === 'true' ? 1n : 0n), ty: 'bool' };
      const r = A.roles.get(n);
      if (A.genericSet.has(n) && r?.kind !== 'syncout') return { ast: { k: 'id', name: A.orig(n) }, ty: 'num' };
      const sig = readable(n, A);
      if (sig) return { ast: { k: 'id', name: sig.name }, ty: sig.w === 1 ? 'bit' : 'vec', w: sig.w };
      if (A.consts.has(n) && !A.stateByKey.has(n)) {
        const c = A.consts.get(n);
        if (c.value == null) fail(`constant '${A.orig(n)}' used${atLine(X.loc)} has no constant value`);
        return { ast: lit(c.value), ty: 'num' };
      }
      if (n === A.clock || n === A.reset.name) fail(`${where} reads the ${n === A.clock ? 'clock' : 'reset'} '${A.orig(n)}', which a chart cannot express`);
      if (r) fail(`${where} reads '${A.orig(n)}', which is written by the state machine (only inputs and registered outputs can be read)`);
      fail(`${where} reads '${A.orig(n)}', which is not an input of the state machine`);
    }
    case 'apply': {
      const name = e.name;
      const args = e.args.map((x) => (x && x.op ? x : x?.value));
      if (['unsigned', 'std_logic_vector', 'to_integer', 'std_logic', 'to_stdlogicvector', 'conv_integer'].includes(name) && args.length === 1) return conv(args[0], A, X);
      if (name === 'resize' && args.length === 2) {
        const r = conv(args[0], A, X);
        const n = evalInt(args[1], A.consts);
        if (n == null || n < 1n) return r;
        // the width at which VHDL evaluates the operand (see vhdlSized)
        if (r.ast.k === 'id' || (r.ast.k !== 'lit' && !A.vw.has(r.ast))) A.vw.set(r.ast, Number(n));
        return { ...r, ty: r.ty === 'bool' ? r.ty : 'vec', w: Number(n) };
      }
      if ((name === 'shift_left' || name === 'shift_right') && args.length === 2) {
        const a = conv(args[0], A, X), b = conv(args[1], A, X);
        const ast = { k: 'bin', op: name === 'shift_left' ? '<<' : '>>', a: a.ast, b: b.ast };
        A.vw.set(ast, a.w || 32);
        return { ast, ty: 'vec', w: a.w };
      }
      if ((name === 'to_unsigned' || name === 'conv_std_logic_vector') && args.length === 2) {
        let usesGeneric = false;
        walkExpr(args[0], (x) => { if (x.op === 'ref' && A.genericSet.has(x.name)) usesGeneric = true; });
        if (usesGeneric) return conv(args[0], A, X);
        const v = evalInt(args[0], A.consts);
        const n = evalInt(args[1], A.consts);
        if (v != null && n != null && n >= 1n && n <= 256n) return { ast: lit(v, Number(n), 'd'), ty: 'vec', w: Number(n) };
        if (v != null) return { ast: lit(v), ty: 'num' };
        return conv(args[0], A, X);
      }
      if (name === 'signed' || name === 'to_signed') fail(`${where} uses signed arithmetic, which is not supported`);
      if ((A.roles.has(name) || A.ports.has(name)) && args.length === 1 && args[0]) return convSel(name, args[0], null, A, X);
      if (A.roles.has(name) || A.ports.has(name)) fail(`${where} selects bits of '${A.orig(name)}' in a way a chart cannot express`);
      fail(`${where} calls '${A.orig(name)}', which a chart cannot express`);
    }
    case 'qualified': return conv(e.expr, A, X);
    case 'aggregate': {
      const others = e.items.find((it) => it.choices?.includes('others'));
      const zero = e.items.find((it) => it.choices?.length === 1 && it.choices[0]?.op === 'int' && it.choices[0].value === '0');
      if (e.items.length === 2 && zero && others && others.value.op === 'lit' && others.value.bits === '0') return conv(zero.value, A, X);
      if (e.items.length === 1 && others && others.value.op === 'lit') {
        if (others.value.bits === '0') return { ast: lit(0n), ty: 'num' };
        if (X.width) return { ast: lit((1n << BigInt(X.width)) - 1n), ty: 'num' };
      }
      if (e.items.length === 1 && zero) return conv(zero.value, A, X);
      fail(`${where} uses an aggregate that a chart cannot express`);
    }
    case 'unary': {
      const a = conv(e.a, A, X);
      if (e.o === '~') {
        if (a.ty === 'bool') return { ast: { k: 'un', op: '!', a: a.ast }, ty: 'bool' };
        const ast = { k: 'un', op: '~', a: a.ast };
        if (a.w) A.vw.set(ast, a.w);
        return { ast, ty: a.ty, w: a.w };
      }
      if (e.o === '!') return { ast: { k: 'un', op: '!', a: a.ast }, ty: 'bool' };
      if (e.o === '-') { const ast = { k: 'un', op: '-', a: a.ast }; if (a.w) A.vw.set(ast, a.w); return { ast, ty: 'vec', w: a.w }; }
      if (e.o === '+') return a;
      fail(`${where} uses the reduction operator '${e.o}', which a chart cannot express`);
    }
    case 'binary': {
      const a = conv(e.a, A, X), b = conv(e.b, A, X);
      let op = e.o;
      if (A.lang === 'vhdl' && (op === '&' || op === '|') && (a.ty === 'bool' || b.ty === 'bool')) op = op === '&' ? '&&' : '||';
      if (!ASM_BIN.has(op)) fail(`${where} uses the operator '${e.o}', which a chart cannot express (supported: == != < > <= >= && || ! & | ^ ~ + - << >>)`);
      const ast = { k: 'bin', op, a: a.ast, b: b.ast };
      if (BOOL_OPS.has(op)) return { ast, ty: 'bool' };
      if (op === '<<' || op === '>>') { A.vw.set(ast, a.w || 32); return { ast, ty: 'vec', w: a.w }; }
      if (op === '&' || op === '|' || op === '^') {
        if (a.ty === 'bool' || b.ty === 'bool') return { ast, ty: 'bool' };
        const w = Math.max(a.w || 1, b.w || 1);
        A.vw.set(ast, w);
        return { ast, ty: w === 1 && a.ty !== 'num' ? 'bit' : 'vec', w };
      }
      const w = Math.max(a.w || 1, b.w || 1);
      A.vw.set(ast, w);
      return { ast, ty: 'vec', w };
    }
    case 'cond': fail(`${where} uses a conditional value (when/else, ?:) inside a state, which a chart cannot express; use if/else`);
    case 'concat': fail(`${where} uses concatenation, which a chart cannot express`);
    case 'index': case 'slice': case 'pslice': {
      if (e.base?.op !== 'ref') fail(`${where} selects bits of an expression, which a chart cannot express`);
      if (e.op === 'index') return convSel(e.base.name, e.index, null, A, X);
      if (e.op === 'slice') return convSel(e.base.name, e.left, e.right, A, X);
      const start = evalInt(e.start, A.consts), width = evalInt(e.width, A.consts);
      if (start == null || width == null || width < 1n) fail(`${where} selects bits of '${A.orig(e.base.name)}' with a variable part-select, which a chart cannot express`);
      const lo = e.dir === '-' ? start - width + 1n : start;
      return convSel(e.base.name, lit(lo + width - 1n), lit(lo), A, X);
    }
    case 'call': fail(`${where} calls '${e.name}', which a chart cannot express`);
  }
  fail(`${where} cannot be expressed in a chart (${e.op})`);
}

// ---------------------------------------------------------------------------------------
// Statements -> per-state decision trees
// ---------------------------------------------------------------------------------------
// Tree: { k: 'act', acts, next } | { k: 'if', cond, t, f } | { k: 'leaf' }
// act item: { goto: stateKey | '@self' } or { target, ast, prefix? }

// VHDL evaluates `unsigned + natural`, shifts and `not` at the width of their vector operands,
// while the chart (like Verilog) evaluates them at the width of their context, and unsized
// literals count as 32 bits. Where the context matters (operands of a comparison that hold
// arithmetic, shifts or ~; the right-hand side of an assignment with >>) the unsized literals
// of a VHDL expression are given the width VHDL used, so that the chart means the same.
const SIZE_SENSITIVE = new Set(['+', '-', '<<', '>>', '~', 'neg']);
const ARITH = new Set(['+', '-', '&', '|', '^']);
const CMPS = new Set(['==', '!=', '<', '>', '<=', '>=']);
function ctxSens(ast, ops = SIZE_SENSITIVE) {
  if (ast.k === 'un') return ast.op !== '!' && (ops.has(ast.op === '-' ? 'neg' : ast.op) || ctxSens(ast.a, ops));
  if (ast.k !== 'bin') return false;
  if (ops.has(ast.op)) return true;
  if (ARITH.has(ast.op)) return ctxSens(ast.a, ops) || ctxSens(ast.b, ops);
  if (ast.op === '<<' || ast.op === '>>') return ctxSens(ast.a, ops);
  return false;
}
function hasSignal(ast, A) {
  if (ast.k === 'id') return !A.generics.some((g) => A.orig(g.name) === ast.name);
  if (ast.k === 'sel') return true;
  if (ast.k === 'un') return hasSignal(ast.a, A);
  if (ast.k === 'bin') return hasSignal(ast.a, A) || hasSignal(ast.b, A);
  return false;
}
function vhdlSized(ast, A, inSens = false, W = 0) {
  const vw = (x) => A.vw.get(x) ?? (x.k === 'lit' ? x.w ?? 0 : x.k === 'id' && hasSignal(x, A) ? A.asmWidth(x.name) : x.k === 'sel' ? x.hi - x.lo + 1 : 0);
  switch (ast.k) {
    case 'lit': return inSens && ast.w == null ? lit(ast.v, Math.max(W || 32, ast.v.toString(2).length), 'd') : ast;
    case 'un':
      if (ast.op === '!') return { ...ast, a: vhdlSized(ast.a, A) };
      return { ...ast, a: vhdlSized(ast.a, A, inSens, A.vw.get(ast) ?? W) };
    case 'bin': {
      if (CMPS.has(ast.op)) {
        const s = ctxSens(ast.a) || ctxSens(ast.b);
        const Wc = Math.max(vw(ast.a), vw(ast.b));
        return { ...ast, a: vhdlSized(ast.a, A, s, Wc), b: vhdlSized(ast.b, A, s, Wc) };
      }
      if (ast.op === '&&' || ast.op === '||') return { ...ast, a: vhdlSized(ast.a, A), b: vhdlSized(ast.b, A) };
      if (!inSens || !hasSignal(ast, A)) return ast;
      const Wn = A.vw.get(ast) ?? W;
      if (ast.op === '<<' || ast.op === '>>') return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, ctxSens(ast.b), vw(ast.b)) };
      return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, true, Wn) };
    }
  }
  return ast;
}

/** Verilog self-determined width (unsized literals and generics: 32 bits). */
function selfWidth(ast, wOf) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': return wOf(ast.name);
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : selfWidth(ast.a, wOf);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf));
      if (ast.op === '<<' || ast.op === '>>') return selfWidth(ast.a, wOf);
      return 1;
  }
  return 1;
}

/**
 * Key of the meaning of an expression where literal widths are concerned: they only matter
 * through the width a comparison (or an assignment with >>) is evaluated at, which is part of
 * the key; the widths of the literals themselves are dropped.
 */
function widthKey(ast, wOf) {
  switch (ast.k) {
    case 'lit': return lit(ast.v);
    case 'un': return { ...ast, a: widthKey(ast.a, wOf) };
    case 'bin': {
      const k = { ...ast, a: widthKey(ast.a, wOf), b: widthKey(ast.b, wOf) };
      if (CMPS.has(ast.op) && (ctxSens(ast.a) || ctxSens(ast.b))) k.op = `${ast.op}@${Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf))}`;
      if ((ast.op === '<<' || ast.op === '>>') && ctxSens(ast.b)) k.b = { k: 'un', op: `@${selfWidth(ast.b, wOf)}`, a: k.b };
      return k;
    }
  }
  return ast;
}

function makeTreeBuilder(A) {
  const condOf = (e, loc) => {
    const r = conv(e, A, { loc });
    return A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A), true, A.asmWidth) : r.ast;
  };
  const rhsOf = (e, width, loc) => {
    const r = conv(e, A, { loc, width });
    let ast = A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A, ctxSens(r.ast, new Set(['>>'])), A.vw.get(r.ast) ?? r.w ?? 0), false, A.asmWidth) : r.ast;
    if (ast.k === 'lit') {
      if (width === 1 || A.lang === 'vhdl') ast = lit(ast.v);
      else if (ast.w == null) ast = lit(ast.v);
    }
    if (width === 1 && r.ty === 'vec') fail(`assignment${atLine(loc)} gives a ${r.w}-bit value to a 1-bit output`);
    return ast;
  };
  const action = (st, ctx) => {
    if (st.target.op !== 'ref') fail(`assignment${atLine(st.loc)} writes part of a signal: not supported in a chart`);
    const n = st.target.name;
    const r = A.roles.get(n);
    if (!r) fail(`assignment${atLine(st.loc)} to '${A.orig(n)}', which is not part of the state machine`);
    if ((r.kind === 'state' && ctx === 'clocked') || (r.kind === 'next' && ctx === 'comb')) {
      if (st.value.op === 'ref' && st.value.name === A.S) return { goto: '@self' };
      const s = A.stateOfExpr(st.value);
      if (!s) fail(`next-state assignment${atLine(st.loc)} is not a state constant`);
      return { goto: s.key };
    }
    if ((r.kind === 'out' || r.kind === 'reg') && ctx === 'comb') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    if (r.kind === 'regcur' && ctx === 'clocked') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    fail(`'${A.orig(n)}' is assigned${atLine(st.loc)} in a ${ctx === 'clocked' ? 'clocked' : 'combinational'} process, which does not match its role in the state machine`);
  };
  // VHDL boolean action: `if C then o <= '1'; else o <= '0'; end if;` == `o = C`
  // (also `o <= '1' when C else '0'` and `o = C ? 1 : 0` in both languages)
  const boolAssign = (st, ctx) => {
    if (A.lang !== 'vhdl' && !st.fromCond) return null;
    const t = stmtList(st.then), f = stmtList(st.else);
    if (t.length !== 1 || f.length !== 1 || t[0].kind !== 'assign' || f[0].kind !== 'assign') return null;
    if (t[0].target.op !== 'ref' || f[0].target.op !== 'ref' || t[0].target.name !== f[0].target.name) return null;
    const r = A.roles.get(t[0].target.name);
    if (!r || !r.out || r.kind === 'next' || r.kind === 'state') return null;
    const w = A.outInfo.get(r.out).width;
    const one = rhsOf(t[0].value, w, t[0].loc), zero = rhsOf(f[0].value, w, f[0].loc);
    if (one.k !== 'lit' || zero.k !== 'lit' || one.v !== 1n || zero.v !== 0n) return null;
    let c = conv(st.cond, A, { loc: st.loc }).ast;
    if (A.lang === 'vhdl') c = vhdlSized(c, A);
    if (st.fromCond) {
      c = A.lang === 'vhdl' ? simpLogical(c, true, A.asmWidth) : c;
      if (w !== 1 && !asmIsBool(c)) return null;
    } else {
      c = simpLogical(c, false, A.asmWidth);
      if (!asmIsBool(c)) return null;
    }
    const a = action(t[0], ctx);
    return { ...a, ast: c };
  };
  const caseChain = (st) => {
    let chain = st.default ? stmtList(st.default) : [];
    for (let i = st.items.length - 1; i >= 0; i--) {
      const it = st.items[i];
      const bodyList = stmtList(it.body);
      const loc = it.body?.loc || bodyList[0]?.loc || st.loc;
      const conds = it.choices.map((ch) => (ch.range
        ? { op: 'binary', o: '&&', a: { op: 'binary', o: '>=', a: st.expr, b: ch.range.right }, b: { op: 'binary', o: '<=', a: st.expr, b: ch.range.left } }
        : { op: 'binary', o: '==', a: st.expr, b: ch }));
      const cond = conds.reduce((x, y) => ({ op: 'binary', o: '||', a: x, b: y }));
      chain = [{ kind: 'if', cond, then: bodyList, else: chain, loc }];
    }
    return chain;
  };
  // The value tested by a case box: a readable signal or a bit selection of one (else null).
  const caseSubject = (e, loc) => {
    let r;
    try { r = conv(e, A, { loc }); } catch { return null; }
    if (r.ast.k === 'sel') return { ast: r.ast, w: r.w };
    if (r.ast.k === 'id' && r.ty !== 'num' && r.w) return { ast: r.ast, w: r.w };
    return null;
  };
  // A constant choice of a case on a `w`-bit value (else null).
  const caseValue = (ch, w, loc) => {
    if (!ch || ch.range) return null;
    let r;
    try { r = conv(ch, A, { loc }); } catch { return null; }
    if (r.ast.k !== 'lit' || r.ast.v >= 1n << BigInt(w)) return null;
    if (A.lang === 'vhdl' && r.ast.w != null && r.ast.w !== w) return null;
    return r.ast.v;
  };
  // items: [{ values: [BigInt], body: [stmt] }]; others: [stmt] | null
  const caseItems = (subj, items, others, rest, ctx) => {
    const seen = new Set();
    for (const it of items) for (const v of it.values) { if (seen.has(v)) return null; seen.add(v); }
    const full = subj.w <= 16 && seen.size === 2 ** subj.w;
    const branches = items.map((it) => ({ values: it.values, sub: toTree([...it.body, ...rest], ctx) }));
    // (an others arm with statements is kept even when the values are all listed)
    if (!full || (others && others.length)) branches.push({ values: null, sub: toTree([...(others || []), ...rest], ctx) });
    return { k: 'case', expr: subj.ast, w: subj.w, branches };
  };
  // HDL `case` on an input/register (or a selection of one) with constant choices -> case box
  const caseStmtTree = (st, rest, ctx) => {
    const subj = caseSubject(st.expr, st.loc);
    if (!subj) return null;
    const items = [];
    for (const it of st.items) {
      const values = it.choices.map((ch) => caseValue(ch, subj.w, st.loc));
      if (!values.length || values.some((v) => v == null)) return null;
      items.push({ values, body: stmtList(it.body) });
    }
    return caseItems(subj, items, st.default ? stmtList(st.default) : null, rest, ctx);
  };
  // `x = v1 or x = v2 ...` on the same multi-bit selection (VHDL case boxes on a slice are
  // generated as if/elsif chains): { subj, values } or null
  const sliceTest = (cond, loc) => {
    let r;
    try { r = conv(cond, A, { loc }); } catch { return null; }
    const values = [];
    let subj = null;
    const walk = (x) => {
      if (x.k === 'bin' && x.op === '||') return walk(x.a) && walk(x.b);
      if (x.k !== 'bin' || x.op !== '==' || x.a.k !== 'sel' || x.b.k !== 'lit') return false;
      if (subj && exprToString(subj) !== exprToString(x.a)) return false;
      subj = x.a;
      values.push(x.b.v);
      return true;
    };
    if (!walk(r.ast) || subj.hi === subj.lo) return null;
    const w = subj.hi - subj.lo + 1;
    if (values.some((v) => v >= 1n << BigInt(w)) || !A.caseExprs?.has(exprToString(subj))) return null;
    return { subj: { ast: subj, w }, values };
  };
  const sliceChainTree = (st, rest, ctx) => {
    if (A.lang !== 'vhdl') return null;
    const first = sliceTest(st.cond, st.loc);
    if (!first) return null;
    const key = exprToString(first.subj.ast);
    const items = [{ values: first.values, body: stmtList(st.then) }];
    let others = stmtList(st.else);
    while (others.length === 1 && others[0].kind === 'if') {
      const t = sliceTest(others[0].cond, others[0].loc);
      if (!t || exprToString(t.subj.ast) !== key) break;
      items.push({ values: t.values, body: stmtList(others[0].then) });
      others = stmtList(others[0].else);
    }
    return caseItems(first.subj, items, others, rest, ctx);
  };
  const toTree = (list, ctx) => {
    list = stmtList(list);
    const acts = [];
    const withActs = (node) => (acts.length ? { k: 'act', acts, next: node } : node);
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'assign') { acts.push(action(st, ctx)); continue; }
      if (st.kind === 'case') {
        const node = caseStmtTree(st, list.slice(i + 1), ctx);
        if (node) return withActs(node);
        list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue;
      }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { acts.push(ba); continue; }
        const sc = sliceChainTree(st, list.slice(i + 1), ctx);
        if (sc) return withActs(sc);
        const rest = list.slice(i + 1);
        const node = { k: 'if', cond: condOf(st.cond, st.loc),
          t: toTree([...stmtList(st.then), ...rest], ctx), f: toTree([...stmtList(st.else), ...rest], ctx) };
        return acts.length ? { k: 'act', acts, next: node } : node;
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return acts.length ? { k: 'act', acts, next: { k: 'leaf' } } : { k: 'leaf' };
  };
  // Every-cycle blocks: sequential items { k: 'acts', acts } | { k: 'if', cond, t, f }; the
  // statement after an `if` is where both branches join again.
  const toSeq = (list, ctx) => {
    list = stmtList(list);
    const out = [];
    const push = (a) => {
      if (a.goto) fail(`assignment${atLine(a.loc)} changes the state in logic that does not depend on the state`);
      if (out.length && out[out.length - 1].k === 'acts') out[out.length - 1].acts.push(a);
      else out.push({ k: 'acts', acts: [a] });
    };
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'null') continue;
      if (st.kind === 'assign') {
        if (st.delay) fail(`assignment${atLine(st.loc)} has a delay, which a state machine chart cannot express`);
        if (st.value.op === 'cond') {
          list = [...list.slice(0, i), { kind: 'if', cond: st.value.cond, fromCond: true, loc: st.loc,
            then: [{ ...st, value: st.value.then }], else: [{ ...st, value: st.value.else }] }, ...list.slice(i + 1)];
          i--; continue;
        }
        push({ ...action(st, ctx), loc: st.loc });
        continue;
      }
      if (st.kind === 'case') { list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue; }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { push(ba); continue; }
        out.push({ k: 'if', cond: condOf(st.cond, st.loc), t: toSeq(st.then, ctx), f: toSeq(st.else, ctx) });
        continue;
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return out;
  };
  return { toTree, toSeq };
}

function restrict(t, key, neg, value, W) {
  if (t.k === 'act') return { ...t, next: restrict(t.next, key, neg, value, W) };
  if (t.k === 'case') return { ...t, branches: t.branches.map((br) => ({ ...br, sub: restrict(br.sub, key, neg, value, W) })) };
  if (t.k === 'if') {
    const k = condKey(t.cond, W);
    if (k === key) return restrict(value ? t.t : t.f, key, neg, value, W);
    if (k === neg) return restrict(value ? t.f : t.t, key, neg, value, W);
    return { ...t, t: restrict(t.t, key, neg, value, W), f: restrict(t.f, key, neg, value, W) };
  }
  return t;
}

/**
 * Merge the trees of two processes into one decision tree. When both start with different
 * decisions, the one ranked first (order of the decisions in the header / previous chart)
 * goes on top; by default the first process (usually the next-state logic) wins.
 */
function mergeTrees(a, b, W, rank = () => Infinity) {
  if (a.k === 'act') return { k: 'act', acts: a.acts, next: mergeTrees(a.next, b, W, rank) };
  if (b.k === 'act') return { k: 'act', acts: b.acts, next: mergeTrees(a, b.next, W, rank) };
  if (a.k === 'leaf') return b;
  if (b.k === 'leaf') return a;
  if (a.k === 'case' && b.k === 'case' && caseKey(a) === caseKey(b)) return mergeCases(a, b, W, rank);
  if (a.k === 'case') {
    return { ...a, branches: a.branches.map((br) => ({ ...br, sub: mergeTrees(br.sub, restrictCase(b, a, br.values), W, rank) })) };
  }
  if (b.k === 'case') {
    const key = condKey(a.cond, W), neg = condNegKey(a.cond, W);
    return { k: 'if', cond: a.cond, t: mergeTrees(a.t, restrict(b, key, neg, true, W), W, rank), f: mergeTrees(a.f, restrict(b, key, neg, false, W), W, rank) };
  }
  if (rank(b.cond) < rank(a.cond)) {
    const key = condKey(b.cond, W), neg = condNegKey(b.cond, W);
    if (condKey(a.cond, W) !== key && condKey(a.cond, W) !== neg) {
      return { k: 'if', cond: b.cond, t: mergeTrees(restrict(a, key, neg, true, W), b.t, W, rank),
        f: mergeTrees(restrict(a, key, neg, false, W), b.f, W, rank) };
    }
  }
  const key = condKey(a.cond, W), neg = condNegKey(a.cond, W);
  const bt = restrict(b, key, neg, true, W), bf = restrict(b, key, neg, false, W);
  return { k: 'if', cond: a.cond, t: mergeTrees(a.t, bt, W, rank), f: mergeTrees(a.f, bf, W, rank) };
}

const caseKey = (t) => exprToString(t.expr);
/** Index of the branch of case tree `t` taken for value `v` (the others branch, or -1). */
function caseBranch(t, v) {
  const i = t.branches.findIndex((br) => br.values && br.values.includes(v));
  return i >= 0 ? i : t.branches.findIndex((br) => !br.values);
}
const caseSub = (t, i) => (i >= 0 ? t.branches[i].sub : { k: 'leaf' });

/** Values of case tree `c` that go to its others branch, or null when there are too many. */
function othersValues(c) {
  if (c.w > 16) return null;
  const listed = new Set(c.branches.flatMap((br) => br.values || []));
  const out = [];
  for (let v = 0n; v < 1n << BigInt(c.w); v++) if (!listed.has(v)) out.push(v);
  return out;
}

/** Tree `t` where the subject of case tree `c` is known to be one of `values` (null: others of c). */
function restrictCase(t, c, values) {
  if (t.k === 'act') return { ...t, next: restrictCase(t.next, c, values) };
  if (t.k === 'if') return { ...t, t: restrictCase(t.t, c, values), f: restrictCase(t.f, c, values) };
  if (t.k !== 'case') return t;
  if (caseKey(t) === caseKey(c)) {
    const vals = values || othersValues(c);
    if (vals && vals.length) {
      const idx = new Set(vals.map((v) => caseBranch(t, v)));
      if (idx.size === 1) return restrictCase(caseSub(t, [...idx][0]), c, values);
    }
  }
  return { ...t, branches: t.branches.map((br) => ({ ...br, sub: restrictCase(br.sub, c, values) })) };
}

/** Merge two case trees on the same value: one branch per distinct pair of branches taken. */
function mergeCases(a, b, W, rank) {
  const groups = new Map();
  const seen = new Set();
  for (const t of [a, b]) {
    for (const br of t.branches) {
      for (const v of br.values || []) {
        if (seen.has(v)) continue;
        seen.add(v);
        const ia = caseBranch(a, v), ib = caseBranch(b, v);
        const k = `${ia},${ib}`;
        if (!groups.has(k)) groups.set(k, { ia, ib, values: [] });
        groups.get(k).values.push(v);
      }
    }
  }
  const branches = [...groups.values()].map((g) => ({ values: g.values, sub: mergeTrees(caseSub(a, g.ia), caseSub(b, g.ib), W, rank) }));
  const oa = a.branches.findIndex((br) => !br.values), ob = b.branches.findIndex((br) => !br.values);
  if (!(a.w <= 16 && seen.size === 2 ** a.w) || oa >= 0 || ob >= 0) {
    branches.push({ values: null, sub: mergeTrees(caseSub(a, oa), caseSub(b, ob), W, rank) });
  }
  return { ...a, branches };
}

/**
 * Exits of a case box built from case tree `t`: [{ label, sub }]. The labels, their order and
 * the exits whose arm the generator left to `others` are taken from the `<expr> = <label>`
 * conditions of the header / previous chart when they match.
 */
function caseLabels(t, conds, lang) {
  const xt = exprToString(t.expr);
  const known = [];
  for (const c of conds) {
    if (!c.startsWith(`${xt} = `)) continue;
    const label = c.slice(xt.length + 3).trim();
    const r = parseCaseChoices(label, t.w);
    if (r.error) continue;
    known.push(r.others ? { label: 'others', others: true } : { label, values: r.values });
  }
  const setKey = (vals) => vals.map(String).sort().join(',');
  const branches = t.branches.map((br) => ({ ...br }));
  const oi = branches.findIndex((br) => !br.values);
  if (oi >= 0) {
    // values the generated code left to the others arm (same effect)
    const listed = new Set(branches.flatMap((br) => br.values || []));
    let added = false;
    for (const k of known) {
      if (k.others || !k.values.length || k.values.some((v) => listed.has(v))) continue;
      k.values.forEach((v) => listed.add(v));
      branches.splice(oi, 0, { values: k.values, sub: branches[oi].sub });
      added = true;
    }
    if (added && !known.some((k) => k.others) && t.w <= 16 && listed.size === 2 ** t.w) branches.pop();
  }
  const pos = (br) => {
    const i = known.findIndex((k) => (br.values ? k.values && setKey(k.values) === setKey(br.values) : k.others));
    return i < 0 ? Infinity : i;
  };
  const order = branches.map((br, i) => ({ br, i, p: pos(br) }))
    .sort((x, y) => (x.p === y.p ? (!x.br.values) - (!y.br.values) || x.i - y.i : x.p - y.p));
  return order.map(({ br, p }) => {
    if (!br.values) return { label: 'others', sub: br.sub };
    if (p !== Infinity) return { label: known[p].label, sub: br.sub };
    const text = (v) => (lang === 'vhdl' || t.w === 1 ? v.toString(2).padStart(t.w, '0') : `${t.w}'d${v}`);
    return { label: br.values.map(text).join('|'), sub: br.sub };
  });
}

/** Resolve next-state assignments: leaves become { k: 'goto', state }. */
function resolveTree(t, cur, self) {
  if (t.k === 'act') {
    let c = cur;
    const acts = [];
    for (const x of t.acts) { if (x.goto) c = x.goto === '@self' ? self : x.goto; else acts.push(x); }
    const next = resolveTree(t.next, c, self);
    if (!acts.length) return next;
    if (next.k === 'act') return { k: 'act', acts: lastWins([...acts, ...next.acts]), next: next.next };
    return { k: 'act', acts: lastWins(acts), next };
  }
  if (t.k === 'if') {
    const T = resolveTree(t.t, cur, self), F = resolveTree(t.f, cur, self);
    if (treeSig(T) === treeSig(F)) return T;
    return { k: 'if', cond: t.cond, t: T, f: F };
  }
  if (t.k === 'case') {
    const branches = t.branches.map((br) => ({ ...br, sub: resolveTree(br.sub, cur, self) }));
    if (branches.every((br) => treeSig(br.sub) === treeSig(branches[0].sub))) return branches[0].sub;
    return { ...t, branches };
  }
  return { k: 'goto', state: cur || self };
}

/** Drop assignments overridden later in the same box (e.g. a default before the case). */
function lastWins(acts) {
  return acts.filter((a, i) => !acts.slice(i + 1).some((b) => b.target === a.target));
}

const treeSig = (t) => JSON.stringify(t, (k, v) => (typeof v === 'bigint' ? `${v}n` : k === 'loc' ? undefined : v));

function assignsOnEveryPath(t, target) {
  if (t.k === 'act') return t.acts.some((x) => x.target === target) || assignsOnEveryPath(t.next, target);
  if (t.k === 'if') return assignsOnEveryPath(t.t, target) && assignsOnEveryPath(t.f, target);
  if (t.k === 'case') return t.branches.every((br) => assignsOnEveryPath(br.sub, target));
  return false;
}

// ---------------------------------------------------------------------------------------
// Text of conditions and actions (prefer the spelling of the header / previous chart)
// ---------------------------------------------------------------------------------------

function makeTexts(A, lang) {
  const W = A.asmWidth;
  const wOf = (n) => (A.genericSet.has(n) || A.generics.some((g) => A.orig(g.name) === n) ? 32 : W(n));
  const strictCond = (ast) => (lang === 'vhdl' ? exprToString(widthKey(simpLogical(ast, true, W), wOf)) : exprToString(ast));
  const negCond = (ast) => {
    if (lang === 'vhdl') {
      if (isBit(ast, W)) return { k: 'bin', op: '==', a: ast, b: lit(0n) };
      if (ast.k === 'bin' && ast.op === '==' && isBit(ast.a, W) && ast.b.k === 'lit' && ast.b.v <= 1n) {
        return ast.b.v === 1n ? { ...ast, b: lit(0n) } : ast.a;
      }
    }
    if (ast.k === 'un' && ast.op === '!') return ast.a;
    return { k: 'un', op: '!', a: ast };
  };
  const strictAction = (target, ast) => {
    const w = A.outWidth(target);
    if (ast.k === 'lit') {
      if (lang === 'vhdl' || w === 1) return `${target}:#${ast.v}`;
      return `${target}:#${ast.base === 'b' ? 'b' : ast.base === 'h' ? 'h' : 'd'}${ast.v}`;
    }
    const wide = ctxSens(ast, new Set(['>>'])) ? `@${Math.max(w, selfWidth(ast, wOf))}` : '';
    return `${target}${wide}:${lang === 'vhdl' ? exprToString(widthKey(simpLogical(ast, false, W), wOf)) : exprToString(ast)}`;
  };
  const condText = (ast, cands) => {
    const key = strictCond(ast);
    for (const c of cands) {
      const p = parseCondition(c);
      if (p.error) continue;
      if (strictCond(p.ast) === key) return { text: c, swap: false };
    }
    for (const c of cands) {
      const p = parseCondition(c);
      if (p.error) continue;
      if (strictCond(negCond(p.ast)) === key) return { text: c, swap: true };
    }
    return { text: exprToString(ast), swap: false };
  };
  const actionMatches = (act, text) => {
    const p = parseAction(text);
    return !p.error && p.target === act.target && strictAction(p.target, p.ast) === strictAction(act.target, act.ast);
  };
  const actionText = (act, cands) => cands.find((c) => actionMatches(act, c)) || `${act.target} = ${exprToString(act.ast)}`;
  return { condText, actionText, actionMatches };
}

// ---------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------

function encodingsMatching(states, initial, width) {
  const ord = [initial, ...states.filter((s) => s !== initial)];
  const N = ord.length;
  const binW = N <= 1 ? 1 : (N - 1).toString(2).length;
  const out = [];
  if (width === binW && ord.every((s, i) => s.code === BigInt(i))) out.push('binary');
  if (width === binW && ord.every((s, i) => s.code === BigInt(i ^ (i >> 1)))) out.push('gray');
  if (width === Math.max(1, N) && ord.every((s, i) => s.code === 1n << BigInt(i))) out.push('onehot');
  return out;
}

// ---------------------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------------------

function langOf(path, source) {
  if (/\.(vhd|vhdl)$/i.test(path || '')) return 'vhdl';
  if (/\.(v|vh|sv)$/i.test(path || '')) return 'verilog';
  return /\bentity\s+\w+\s+is\b/i.test(source) ? 'vhdl' : 'verilog';
}

/**
 * Extract the ASM chart of the state machine in `source`.
 * Returns { model, warnings }; throws an Error explaining why the module is not a pure FSM.
 */
export function asmFromHdl(source, { path = '', module = null, lang = null, previous = null } = {}) {
  source = String(source ?? '');
  lang = lang || langOf(path, source);
  if (lang !== 'vhdl' && lang !== 'verilog') fail(`unsupported language '${lang}'`);
  const parsed = lang === 'vhdl' ? parseVhdl(source, path || 'input.vhd') : parseVerilog(source, path || 'input.v');
  const perr = parsed.errors.filter((d) => d.severity !== 'warning');
  if (perr.length) fail(`syntax error at line ${perr[0].line}: ${perr[0].message}`);
  const mods = parsed.units.filter((u) => u.kind === 'module');
  if (!mods.length) fail(lang === 'vhdl' ? 'no entity with an architecture found in the file' : 'no module found in the file');
  let mod = mods[0];
  if (module) {
    mod = mods.find((u) => u.name === module || u.name === String(module).toLowerCase());
    if (!mod) fail(`${lang === 'vhdl' ? 'entity' : 'module'} '${module}' not found in the file`);
  }
  if (mod.entityOnly) fail(`entity '${mod.name}' has no architecture`);

  const A = analyzeModule(mod, source, lang);
  A.lang = lang;
  A.vw = new WeakMap(); // VHDL width of expression nodes (see vhdlSized)
  const warnings = A.warnings;
  const header = parseHeader(source, lang);
  const prev = previous ? normalizeModel(previous) : null;

  // names used in the chart
  const outName = (o) => A.orig(o);
  const asmWidths = new Map();
  for (const i of A.inputs) asmWidths.set(A.orig(i), A.widthOf(i));
  for (const o of A.outputs) asmWidths.set(outName(o), A.outInfo.get(o).width);
  for (const r of A.registers) asmWidths.set(A.orig(r), A.outInfo.get(r).width);
  for (const g of A.generics) asmWidths.set(A.orig(g.name), 32);
  A.asmWidth = (name) => asmWidths.get(name) ?? 1;
  A.outWidth = (name) => asmWidths.get(name) ?? 1;

  // ---- text candidates (generator header, previous chart) -------------------------------
  const cands = new Map(); // state name (lower) -> { moore: [[...]], conds: [], mealy: [] }
  const candOf = (name) => {
    const k = name.toLowerCase();
    if (!cands.has(k)) cands.set(k, { moore: [], conds: [], mealy: [] });
    return cands.get(k);
  };
  if (header) {
    for (const [name, h] of header.states) {
      const c = candOf(name);
      if (h.moore) c.moore.push(h.moore);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
    for (const [name, h] of header.always) {
      const c = candOf(`@${name}`);
      c.moore.push(h.actions);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
  }
  if (prev) {
    try {
      for (const st of extractTransitions(prev)) {
        const c = candOf(st.name);
        c.moore.push(st.mooreActions);
        for (const t of st.transitions) {
          for (const x of t.conditions) c.conds.push(x.cond.trim());
          for (const x of t.mealyActions) c.mealy.push(x.action);
        }
      }
    } catch { /* an invalid previous chart only loses its texts */ }
    try {
      for (const b of extractAlwaysBlocks(prev)) {
        const c = candOf(`@${b.name}`);
        c.moore.push(b.actions);
        for (const p of b.paths) {
          for (const x of p.conditions) c.conds.push(x.cond.trim());
          for (const x of p.actions) c.mealy.push(x.action);
        }
      }
    } catch { /* idem */ }
  }
  // decision order per state (header / previous chart): used to stack merged decisions
  const rankOf = (stateName) => {
    const r = new Map();
    for (const t of candOf(stateName).conds) {
      const p = parseCondition(t);
      if (p.error) continue;
      for (const k of [condKey(p.ast, A.asmWidth), condNegKey(p.ast, A.asmWidth)]) if (!r.has(k)) r.set(k, r.size);
    }
    return (ast) => r.get(condKey(ast, A.asmWidth)) ?? Infinity;
  };

  // case boxes listed by the header / previous chart (`<expr> = <label>` conditions)
  A.caseExprs = new Set();
  for (const c of cands.values()) for (const t of c.conds) { const m = /^(.+?) = (?!=)/.exec(t); if (m) A.caseExprs.add(m[1].trim()); }

  // ---- per-state trees -----------------------------------------------------------------
  const TB = makeTreeBuilder(A);
  const trees = new Map();
  for (const s of A.states) {
    const rank = rankOf(s.name);
    let merged = { k: 'leaf' };
    for (const b of A.bodies) merged = mergeTrees(merged, TB.toTree(specStmts(b.stmts, A, s), b.ctx), A.asmWidth, rank);
    let t = resolveTree(merged, null, s.key);
    t = renameTargets(t, (o) => outName(o));
    trees.set(s.key, t);
  }

  // ---- every-cycle blocks ----------------------------------------------------------------
  const renameSeq = (items) => items.map((it) => (it.k === 'acts'
    ? { ...it, acts: it.acts.map((a) => ({ ...a, target: outName(a.target) })) }
    : { ...it, t: renameSeq(it.t), f: renameSeq(it.f) }));
  const alwaysBlocks = A.alwaysGroups.map((g) => ({ name: g.name, items: renameSeq(TB.toSeq(g.stmts, g.ctx)) }));

  // ---- outputs: defaults ---------------------------------------------------------------
  const outputs = [];
  for (const o of A.outputs) {
    const info = A.outInfo.get(o);
    const name = outName(o);
    let def = info.default;
    if (!info.registered && def == null) {
      for (const s of A.states) {
        if (!assignsOnEveryPath(trees.get(s.key), name)) {
          fail(`output '${name}' has no default value and is not assigned on every path of state '${s.name}' (it would infer a latch)`);
        }
      }
      // most frequent constant Moore value becomes the default
      const counts = new Map();
      for (const s of A.states) {
        const t = trees.get(s.key);
        if (t.k !== 'act') continue;
        const a = [...t.acts].reverse().find((x) => x.target === name);
        if (a && a.ast.k === 'lit') counts.set(a.ast.v, (counts.get(a.ast.v) || 0) + 1);
      }
      def = 0n;
      let best = -1;
      for (const [v, n] of counts) if (n > best || (n === best && v === 0n)) { best = n; def = v; }
      for (const s of A.states) {
        const t = trees.get(s.key);
        if (t.k !== 'act') continue;
        const last = [...t.acts].reverse().find((x) => x.target === name);
        if (last && last.ast.k === 'lit' && last.ast.v === def && !assignsDeeper(t.next, name)) {
          const acts = t.acts.filter((x) => x.target !== name);
          trees.set(s.key, acts.length ? { ...t, acts } : t.next);
        }
      }
    }
    let defText = String(def ?? 0n);
    const p = prev?.outputs.find((x) => x.name === name);
    if (p) { const r = parseCondition(p.default); if (!r.error && r.ast.k === 'lit' && r.ast.v === (def ?? 0n)) defText = p.default; }
    outputs.push({ name, width: info.width, default: defText, registered: info.registered });
  }

  const TX = makeTexts(A, lang);

  // ---- nodes and edges -----------------------------------------------------------------
  const nodes = [], edges = [];
  const stateId = new Map();
  let nS = 0, nD = 0, nO = 0, nE = 0, nC = 0;
  for (const s of A.states) stateId.set(s.key, `s${++nS}`);
  const addEdge = (from, port) => { const e = { id: `e${++nE}`, from, to: '', port }; edges.push(e); return e; };
  for (const s of A.states) {
    const c = candOf(s.name);
    let t = trees.get(s.key);
    const stateNode = { id: stateId.get(s.key), type: 'state', name: s.name, x: 0, y: 0, actions: [] };
    nodes.push(stateNode);
    if (t.k === 'act') {
      // Moore actions: the leading unconditional actions (as many as the header/previous chart
      // lists; any further leading actions become an output box right below the state)
      let k = t.acts.length;
      const lists = c.moore;
      if (lists.length) {
        k = 0;
        const ref = lists[0];
        while (k < t.acts.length && k < ref.length && TX.actionMatches(t.acts[k], ref[k])) k++;
      }
      stateNode.actions = t.acts.slice(0, k).map((a) => TX.actionText(a, lists[0] || []));
      t = k < t.acts.length ? { ...t, acts: t.acts.slice(k) } : t.next;
    }
    const build = (tr) => {
      if (tr.k === 'goto') return stateId.get(tr.state);
      if (tr.k === 'case') {
        const id = `c${++nC}`;
        nodes.push({ id, type: 'case', x: 0, y: 0, expr: exprToString(tr.expr) });
        for (const br of caseLabels(tr, c.conds, lang)) addEdge(id, br.label).to = build(br.sub);
        return id;
      }
      if (tr.k === 'act') {
        const id = `o${++nO}`;
        nodes.push({ id, type: 'output', x: 0, y: 0, actions: tr.acts.map((a) => TX.actionText(a, c.mealy)) });
        addEdge(id, 'next').to = build(tr.next);
        return id;
      }
      const id = `d${++nD}`;
      const { text, swap } = TX.condText(tr.cond, c.conds);
      nodes.push({ id, type: 'decision', x: 0, y: 0, cond: text });
      const eT = addEdge(id, 'true'), eF = addEdge(id, 'false');
      eT.to = build(swap ? tr.f : tr.t);
      eF.to = build(swap ? tr.t : tr.f);
      return id;
    };
    const e0 = addEdge(stateNode.id, 'next');
    e0.to = build(t);
  }
  let nA = 0;
  for (const b of alwaysBlocks) {
    const c = candOf(`@${b.name}`);
    const header = { id: `a${++nA}`, type: 'always', name: b.name, x: 0, y: 0, actions: [] };
    nodes.push(header);
    let items = b.items;
    if (items[0]?.k === 'acts') {
      // leading unconditional actions: in the header box (as many as the header/previous chart lists)
      const acts = items[0].acts;
      let k = acts.length;
      if (c.moore.length) {
        k = 0;
        const ref = c.moore[0];
        while (k < acts.length && k < ref.length && TX.actionMatches(acts[k], ref[k])) k++;
      }
      header.actions = acts.slice(0, k).map((a) => TX.actionText(a, c.moore[0] || []));
      items = k < acts.length ? [{ k: 'acts', acts: acts.slice(k) }, ...items.slice(1)] : items.slice(1);
    }
    // boxes, built from the end so that each `if` knows the box where its branches join;
    // then numbered and listed top-down (header, 1 branch, 0 branch)
    const bn = new Map(), be = [];
    let tmp = 0;
    const emit = (list, cont) => {
      let next = cont;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        const id = `#${++tmp}`;
        if (it.k === 'acts') {
          bn.set(id, { id, type: 'output', x: 0, y: 0, actions: it.acts.map((a) => TX.actionText(a, c.mealy)) });
          if (next) be.push({ from: id, to: next, port: 'next' });
        } else {
          const { text, swap } = TX.condText(it.cond, c.conds);
          bn.set(id, { id, type: 'decision', x: 0, y: 0, cond: text });
          const T = emit(it.t, next), F = emit(it.f, next);
          const [tt, ff] = swap ? [F, T] : [T, F];
          if (tt) be.push({ from: id, to: tt, port: 'true' });
          if (ff) be.push({ from: id, to: ff, port: 'false' });
        }
        next = id;
      }
      return next;
    };
    const first = emit(items, null);
    if (first) be.push({ from: header.id, to: first, port: 'next' });
    const order = [header.id];
    const visit = (id) => {
      if (!id || order.includes(id)) return;
      order.push(id);
      for (const port of ['true', 'false', 'next']) visit(be.find((e) => e.from === id && e.port === port)?.to);
    };
    visit(first);
    const fin = new Map([[header.id, header.id]]);
    for (const id of order.slice(1)) {
      const n = bn.get(id);
      n.id = n.type === 'decision' ? `d${++nD}` : `o${++nO}`;
      fin.set(id, n.id);
      nodes.push(n);
    }
    const rank = (e) => order.indexOf(e.from) * 3 + ['true', 'false', 'next'].indexOf(e.port);
    for (const e of be.sort((x, y) => rank(x) - rank(y))) addEdge(fin.get(e.from), e.port).to = fin.get(e.to);
  }

  // ---- encoding ------------------------------------------------------------------------
  let encoding;
  if (A.enumType) encoding = 'enum';
  else {
    const matches = encodingsMatching(A.states, A.initial, A.sWidth);
    const hasAttr = new RegExp(lang === 'vhdl' ? 'attribute\\s+fsm_encoding\\s+of\\s+' : 'synthesis\\s+attribute\\s+fsm_encoding\\s+of\\s+', 'i').test(source);
    const ok = (e) => (e === 'enum' ? matches.includes('binary') && !hasAttr && lang === 'verilog' : matches.includes(e));
    if (header?.encoding && ok(header.encoding)) encoding = header.encoding;
    else if (prev && ok(prev.encoding)) encoding = prev.encoding;
    else if (lang === 'verilog' && !hasAttr && matches.includes('binary')) encoding = 'enum';
    else if (matches.length) encoding = matches[0];
    else {
      encoding = 'binary';
      warnings.push(`the state codes of '${A.orig(A.S)}' follow no standard encoding; the chart re-encodes the states in binary`);
    }
  }

  // ---- model ---------------------------------------------------------------------------
  let name = A.orig(mod.name);
  if (header?.name && header.name.toLowerCase() === name.toLowerCase()) name = header.name;
  if (prev && prev.name.toLowerCase() === name.toLowerCase()) name = prev.name;
  let model = {
    version: 1, name, lang,
    clock: A.orig(A.clock),
    reset: { name: A.orig(A.reset.name), active: A.reset.active, sync: A.reset.sync },
    encoding,
    ...(A.generics.length ? { generics: A.generics.map((g) => ({ name: A.orig(g.name), default: g.default })) } : {}),
    inputs: A.inputs.map((i) => (A.syncOf.has(i) ? { name: A.orig(i), width: A.widthOf(i), sync: true } : { name: A.orig(i), width: A.widthOf(i) })),
    outputs,
    ...(A.registers.length ? { registers: A.registers.map((r) => {
      const info = A.outInfo.get(r);
      const nm = A.orig(r);
      let init = String(info.default ?? 0n);
      for (const text of [header?.regInit.get(nm), prev?.registers?.find((x) => x.name === nm)?.init]) {
        if (text == null) continue;
        const q = parseCondition(text);
        if (!q.error && q.ast.k === 'lit' && q.ast.v === (info.default ?? 0n)) init = text;
      }
      return { name: nm, width: info.width, init };
    }) } : {}),
    nodes, edges,
    initial: stateId.get(A.initial.key),
  };
  const description = header?.description || prev?.description;
  if (description) model.description = description;
  if (prev?.generatedFile) model.generatedFile = prev.generatedFile;
  if (prev?.base) model.base = prev.base;

  const errors = validate(model).filter((d) => d.severity === 'error');
  if (errors.length) {
    fail(`the state machine cannot be represented as an ASM chart:\n${errors.map((d) => `  - ${d.message}`).join('\n')}`);
  }

  model = prev ? reusePrevious(model, prev) : asmLayout(model);

  if (header) {
    try {
      const again = generate(model, lang).code;
      if (again.replace(/\r\n/g, '\n').trimEnd() !== source.replace(/\r\n/g, '\n').trimEnd()) {
        warnings.push('the file was changed by hand after it was generated: regenerating it from the chart will rewrite it in the generator style');
      }
    } catch { /* validated above */ }
  }
  return { model, warnings };
}

function renameTargets(t, f) {
  if (t.k === 'act') return { ...t, acts: t.acts.map((a) => (a.target ? { ...a, target: f(a.target) } : a)), next: renameTargets(t.next, f) };
  if (t.k === 'if') return { ...t, t: renameTargets(t.t, f), f: renameTargets(t.f, f) };
  if (t.k === 'case') return { ...t, branches: t.branches.map((br) => ({ ...br, sub: renameTargets(br.sub, f) })) };
  return t;
}

function assignsDeeper(t, target) {
  if (t.k === 'act') return t.acts.some((x) => x.target === target) || assignsDeeper(t.next, target);
  if (t.k === 'if') return assignsDeeper(t.t, target) || assignsDeeper(t.f, target);
  if (t.k === 'case') return t.branches.some((br) => assignsDeeper(br.sub, target));
  return false;
}

// ---------------------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------------------

/** True if both charts describe the same machine (ids, positions and spelling ignored). */
export function sameAsmStructure(a, b) {
  const A = normalizeModel(a), B = normalizeModel(b);
  // charts with case boxes are compared as JSON (the comparison below knows decisions only)
  if ([...A.nodes, ...B.nodes].some((n) => n.type === 'case')) return JSON.stringify(A) === JSON.stringify(B);
  if (A.name !== B.name || A.clock !== B.clock || A.encoding !== B.encoding) return false;
  if (A.reset.name !== B.reset.name || A.reset.active !== B.reset.active || A.reset.sync !== B.reset.sync) return false;
  const ports = (m) => JSON.stringify([
    m.inputs.map((p) => [p.name, p.width]),
    m.outputs.map((p) => { const r = parseCondition(p.default); return [p.name, p.width, p.registered, r.error ? p.default : String(r.ast.v)]; }),
  ]);
  if (ports(A) !== ports(B)) return false;
  const extras = (m) => JSON.stringify([
    (m.generics || []).map((g) => [g.name, g.default]),
    m.inputs.map((p) => !!p.sync),
    (m.registers || []).map((r) => { const q = parseCondition(r.init); return [r.name, r.width, q.error ? r.init : String(q.ast.v)]; }),
  ]);
  if (extras(A) !== extras(B)) return false;
  const W = new Map([...A.inputs, ...A.outputs, ...(A.registers || [])].map((p) => [p.name, p.width]));
  const wOf = (n) => W.get(n) ?? 1;
  const sum = (m) => {
    const byId = new Map(m.nodes.map((n) => [n.id, n]));
    const ex = exitsOf(m);
    const states = new Map();
    for (const s of m.nodes.filter((n) => n.type === 'state')) {
      states.set(s.name, { moore: s.actions.map((x) => actKey(x, wOf)), root: (ex.get(s.id) || {}).next });
    }
    return { byId, ex, states, initial: byId.get(m.initial)?.name };
  };
  const SA = sum(A), SB = sum(B);
  if (SA.initial !== SB.initial || SA.states.size !== SB.states.size) return false;
  for (const [name, sa] of SA.states) {
    const sb = SB.states.get(name);
    if (!sb || JSON.stringify(sa.moore) !== JSON.stringify(sb.moore)) return false;
    // compare behaviour of the two blocks on every combination of their decisions
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, sa.root, new Set());
    collect(SB, sb.root, new Set());
    if (atoms.size > 16) return false;
    const run = (S, root, bitsv) => {
      const acts = new Map();
      let id = root;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return null;
        if (n.type === 'state') return JSON.stringify([n.name, [...acts].sort()]);
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else {
          for (const x of n.actions) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); }
          id = e.next;
        }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) {
      if (run(SA, sa.root, v) !== run(SB, sb.root, v)) return false;
    }
  }
  // every-cycle blocks: same names in the same order, same final assignments on every path
  const blocksOf = (m) => m.nodes.filter((n) => n.type === 'always');
  const BA = blocksOf(A), BB = blocksOf(B);
  if (BA.length !== BB.length) return false;
  for (let i = 0; i < BA.length; i++) {
    if (BA[i].name !== BB[i].name) return false;
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || n.type === 'always' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, (SA.ex.get(BA[i].id) || {}).next, new Set());
    collect(SB, (SB.ex.get(BB[i].id) || {}).next, new Set());
    if (atoms.size > 16) return false;
    const run = (S, head, bitsv) => {
      const acts = new Map();
      const apply = (list) => { for (const x of list) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); } };
      apply(head.actions);
      let id = (S.ex.get(head.id) || {}).next;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return JSON.stringify([...acts].sort());
        if (n.type === 'state' || n.type === 'always') return null;
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else { apply(n.actions); id = e.next; }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) if (run(SA, BA[i], v) !== run(SB, BB[i], v)) return false;
  }
  return true;
}

function atomOf(cond, wOf) {
  const p = parseCondition(cond);
  if (p.error) return { key: cond, neg: false };
  const c = canon(p.ast, wOf);
  if (c.k === 'un' && c.op === '!') return { key: exprToString(c.a), neg: true };
  if (c.k === 'bin' && c.op === '!=') return { key: exprToString({ ...c, op: '==' }), neg: true };
  return { key: exprToString(c), neg: false };
}

function actKey(text, wOf) {
  const p = parseAction(text);
  if (p.error) return `${text}\u0000`;
  return `${p.target}\u0000${exprToString(canon(p.ast, wOf))}`;
}

export default asmFromHdl;
