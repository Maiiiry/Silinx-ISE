// Silinx - small helpers of the recovery of an ASM chart from HDL (#405: out of asm-from-hdl.js), on the parsers'
// IR: locations, errors, statement lists and walks, conversions, literals and constants, case choices.
// Isomorphic ES module: no DOM and no Node APIs.

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

export const clone = (o) => JSON.parse(JSON.stringify(o));
export const lineOf = (loc) => (loc && loc.line ? loc.line : null);
export const atLine = (loc) => (lineOf(loc) ? ` at line ${loc.line}` : '');

export function fail(msg) { throw new Error(msg); }

/** Flatten a statement (block / array / single statement) into a statement list. */
export function stmtList(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.flatMap(stmtList);
  if (s.kind === 'block') {
    if (s.decls && s.decls.length) fail(`block${atLine(s.loc)} declares local variables, which a state machine chart cannot express`);
    return s.stmts.flatMap(stmtList);
  }
  return [s];
}

/** Visit every statement (recursively) of a statement list. */
export function walkStmts(list, fn) {
  for (const st of stmtList(list)) {
    fn(st);
    if (st.kind === 'if') { walkStmts(st.then, fn); walkStmts(st.else, fn); }
    else if (st.kind === 'case') { for (const it of st.items) walkStmts(it.body, fn); walkStmts(st.default, fn); }
    else if (st.body) walkStmts(st.body, fn);
  }
}

/** Visit every sub-expression of an IR expression. */
export function walkExpr(e, fn) {
  if (!e || typeof e !== 'object') return;
  fn(e);
  for (const k of ['a', 'b', 'cond', 'then', 'else', 'base', 'index', 'left', 'right', 'expr', 'value', 'prefix', 'count']) {
    if (e[k] && typeof e[k] === 'object' && e[k].op) walkExpr(e[k], fn);
  }
  for (const k of ['args', 'parts']) if (Array.isArray(e[k])) for (const x of e[k]) walkExpr(x && x.op ? x : x?.value, fn);
  if (e.op === 'aggregate') for (const it of e.items) walkExpr(it.value, fn);
}

/** Strip VHDL type conversions: std_logic_vector(x), unsigned(x). */
export function stripConv(e) {
  while (e && e.op === 'apply' && ['std_logic_vector', 'unsigned'].includes(e.name) && e.args.length === 1 && e.args[0]?.op) e = e.args[0];
  return e;
}

export function bitsValue(bits, where) {
  if (/[^01]/.test(bits)) fail(`${where}: literals with x/z/- digits are not supported in a state machine chart`);
  return bits ? BigInt('0b' + bits) : 0n;
}
export const lit = (v, w = null, base = 'd') => ({ k: 'lit', v, w, base });

/** Evaluate a constant integer expression (port widths, parameters). */
export function evalInt(e, consts) {
  if (!e) return null;
  switch (e.op) {
    case 'int': return BigInt(e.value);
    case 'lit': return /[^01]/.test(e.bits) ? null : bitsValue(e.bits, '');
    case 'ref': { const c = consts.get(e.name); return c ? c.value : null; }
    case 'unary': { const a = evalInt(e.a, consts); return a == null ? null : e.o === '-' ? -a : e.o === '+' ? a : null; }
    case 'binary': {
      const a = evalInt(e.a, consts), b = evalInt(e.b, consts);
      if (a == null || b == null) return null;
      switch (e.o) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b ? a / b : null; case '**': return a ** b;
      }
    }
  }
  return null;
}

/** VHDL identifiers are lower-cased by the parser: map them back to their spelling in the code. */
export function vhdlCaseMap(src) {
  const map = new Map();
  const text = src.replace(/--[^\n]*/g, ' ').replace(/[bBoOxX]?"[^"\n]*"/g, ' ').replace(/'.'/g, ' ');
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const k = m[0].toLowerCase();
    if (!map.has(k)) map.set(k, m[0]);
  }
  return map;
}

/** Verilog literal bases are not kept in the IR: recover them from the source text, per line. */
export function verilogLiteralTable(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''));
  const perLine = lines.map((l) => [...l.matchAll(/(\d+)\s*'\s*[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)/g)].map((m) => {
    const base = m[2].toLowerCase();
    const digits = m[3].replace(/_/g, '');
    let v = 0n;
    try { for (const ch of digits.toLowerCase()) v = v * BigInt({ b: 2, o: 8, d: 10, h: 16 }[base]) + BigInt(parseInt(ch, 16)); } catch { v = -1n; }
    return { w: parseInt(m[1], 10), base, v };
  }));
  const all = perLine.flat();
  return (line, w, v) => {
    const pick = (list) => list.find((t) => t.w === w && t.v === v);
    const t = (line && perLine[line - 1] && pick(perLine[line - 1])) || pick(all);
    return t ? (t.base === 'o' ? 'd' : t.base) : 'b';
  };
}
