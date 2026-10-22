// Silinx ASM charts - the expression language (#405: out of core/asm.js): its tokenizer and parser, conditions and
// actions, and an expression written back.
import {
  bits
} from './asm.js';

// ---------------------------------------------------------------------------------------
// Expression language: tokenizer + parser
// ---------------------------------------------------------------------------------------

const OPS = ['&&', '||', '==', '!=', '/=', '<<', '>>', '<=', '>=', ':=', '<', '>', '!', '~', '&', '|', '^', '+', '-', '(', ')', '[', ']', ':', '='];
const WORD_OPS = { and: '&&', or: '||', not: '!', xor: '^' };

class ExprError extends Error {}

function parseBased(widthStr, base, digits, src) {
  const clean = digits.replace(/_/g, '');
  const b = base.toLowerCase();
  if (/[xz?]/i.test(clean)) throw new ExprError(`x/z digits are not supported in literal ${src}`);
  const radix = { b: 2, o: 8, d: 10, h: 16 }[b];
  const valid = { b: /^[01]+$/, o: /^[0-7]+$/, d: /^[0-9]+$/, h: /^[0-9a-f]+$/i }[b];
  if (!valid.test(clean)) throw new ExprError(`invalid digits in literal ${src}`);
  let v = 0n;
  for (const ch of clean.toLowerCase()) v = v * BigInt(radix) + BigInt(parseInt(ch, 16));
  let w = widthStr ? parseInt(widthStr, 10) : (b === 'd' ? null : clean.length * { b: 1, o: 3, h: 4 }[b]);
  if (w === 0) throw new ExprError(`zero-width literal ${src}`);
  return { k: 'lit', v, w, base: b };
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    let m;
    if ((m = /^'([01])'/.exec(rest))) {
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt(m[1]), w: 1, base: 'b' }, pos: i });
    } else if ((m = /^(\d+)?\s*'[sS]?([bBoOdDhH])\s*([0-9a-fA-F_xXzZ?]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(m[1], m[2], m[3], m[0]), pos: i });
    } else if ((m = /^0[xX]([0-9a-fA-F_]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(null, 'h', m[1], m[0]), pos: i });
    } else if ((m = /^0[bB]([01_]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(null, 'b', m[1], m[0]), pos: i });
    } else if ((m = /^\d[\d_]*/.exec(rest))) {
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt(m[0].replace(/_/g, '')), w: null, base: 'd' }, pos: i });
    } else if ((m = /^"([01_]*)"/.exec(rest))) {
      const bits = m[1].replace(/_/g, '');
      if (!bits) throw new ExprError('empty bit-string literal ""');
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt('0b' + bits), w: bits.length, base: 'b' }, pos: i });
    } else if ((m = /^"[^"]*"?/.exec(rest))) {
      throw new ExprError(`bit-string literal ${m[0]} may only contain 0, 1 and _`);
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const low = m[0].toLowerCase();
      if (WORD_OPS[low]) toks.push({ t: 'op', v: WORD_OPS[low], pos: i });
      else if (low === 'true' || low === 'false') toks.push({ t: 'lit', v: { k: 'lit', v: low === 'true' ? 1n : 0n, w: 1, base: 'b' }, pos: i });
      else toks.push({ t: 'id', v: m[0], pos: i });
    } else {
      const op = OPS.find((o) => rest.startsWith(o));
      if (!op) throw new ExprError(`unexpected character '${c}'`);
      toks.push({ t: 'op', v: op, pos: i });
      m = [op];
    }
    i += m[0].length;
  }
  toks.push({ t: 'eof', v: '', pos: src.length });
  return toks;
}

const BIN_LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-']];

function makeParser(toks, condMode) {
  let p = 0;
  const peek = () => toks[p];
  const opv = (tk) => {
    if (tk.t !== 'op') return null;
    if (condMode && tk.v === '=') return '==';
    if (tk.v === '/=') return '!=';
    return tk.v;
  };
  const expect = (v) => {
    const tk = toks[p];
    if (opv(tk) !== v) throw new ExprError(`expected '${v}' ${tk.t === 'eof' ? 'at end' : `near '${tk.v}'`}`);
    p++;
  };
  function primary() {
    const tk = toks[p];
    if (tk.t === 'lit') { p++; return tk.v; }
    if (tk.t === 'id') {
      p++;
      // bit / slice selection: name[i], name[h:l], name(i), name(h downto l)
      const open = opv(peek());
      if (open !== '[' && open !== '(') return { k: 'id', name: tk.v };
      p++;
      const close = open === '[' ? ']' : ')';
      const idx = () => {
        const n = toks[p];
        if (n.t !== 'lit' || n.v.w != null) throw new ExprError(`bit index of '${tk.v}' must be a decimal number`);
        p++;
        return Number(n.v.v);
      };
      const hi = idx();
      let lo = hi;
      if (open === '[' && opv(peek()) === ':') { p++; lo = idx(); }
      else if (open === '(' && peek().t === 'id' && peek().v.toLowerCase() === 'downto') { p++; lo = idx(); }
      expect(close);
      if (lo > hi) throw new ExprError(`slice ${tk.v}[${hi}:${lo}]: the left index must be the higher one`);
      return { k: 'sel', name: tk.v, hi, lo };
    }
    const o = opv(tk);
    if (o === '(') { p++; const e = binary(0); expect(')'); return e; }
    if (o === '!' || o === '~' || o === '-') { p++; return { k: 'un', op: o, a: primary() }; }
    if (tk.t === 'eof') throw new ExprError('unexpected end of expression');
    throw new ExprError(`unexpected '${tk.v}'`);
  }
  function binary(level) {
    if (level >= BIN_LEVELS.length) return primary();
    let a = binary(level + 1);
    for (;;) {
      const o = opv(peek());
      if (!o || !BIN_LEVELS[level].includes(o)) return a;
      p++;
      a = { k: 'bin', op: o, a, b: binary(level + 1) };
    }
  }
  return {
    expr() { const e = binary(0); if (peek().t !== 'eof') throw new ExprError(`unexpected '${peek().v}'`); return e; },
    toks, get pos() { return p; }, set pos(v) { p = v; },
  };
}

/** Parse a condition. Returns { ast } or { error }. */
export function parseCondition(src) {
  try {
    if (!String(src ?? '').trim()) return { error: 'empty condition' };
    return { ast: makeParser(tokenize(String(src)), true).expr() };
  } catch (e) {
    if (e instanceof ExprError) return { error: e.message };
    throw e;
  }
}

/** Parse an action `target = expr` or `target`. Returns { target, ast } or { error }. */
export function parseAction(src) {
  try {
    const toks = tokenize(String(src ?? ''));
    if (toks[0].t !== 'id') return { error: 'an action must start with an output or register name' };
    const target = toks[0].v;
    if (toks[1].t === 'eof') return { target, ast: { k: 'lit', v: 1n, w: null, base: 'd' }, implicit: true };
    if (!(toks[1].t === 'op' && ['=', '<=', ':='].includes(toks[1].v))) {
      return { error: `expected '=' after '${target}'` };
    }
    const ps = makeParser(toks.slice(2), false);
    return { target, ast: ps.expr() };
  } catch (e) {
    if (e instanceof ExprError) return { error: e.message };
    throw e;
  }
}

/** Neutral-syntax text of an AST (used in comments). */
export function exprToString(ast) {
  switch (ast.k) {
    case 'id': return ast.name;
    case 'sel': return ast.hi === ast.lo ? `${ast.name}[${ast.hi}]` : `${ast.name}[${ast.hi}:${ast.lo}]`;
    case 'lit': return litNeutral(ast);
    case 'un': return `${ast.op}${ast.a.k === 'bin' ? `(${exprToString(ast.a)})` : exprToString(ast.a)}`;
    case 'bin': {
      const s = (x) => (x.k === 'bin' ? `(${exprToString(x)})` : exprToString(x));
      return `${s(ast.a)} ${ast.op} ${s(ast.b)}`;
    }
  }
  return '?';
}
function litNeutral(l) {
  if (l.w == null) return l.v.toString();
  if (l.base === 'h') return `${l.w}'h${l.v.toString(16).toUpperCase()}`;
  if (l.base === 'd' || l.base === 'o') return `${l.w}'d${l.v}`;
  return `${l.w}'b${bits(l.v, l.w)}`;
}
