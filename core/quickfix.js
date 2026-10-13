// Quick fixes of the errors of an HDL source (#179): edits that correct an error in one click,
// shown where the error is shown (the editor's tooltip, Ctrl+. and the Errors tab). A fix is only
// offered when it is right with high confidence: few, correct suggestions.
//
//   quickFixes(text, lang, d, { modules }) -> [{ title, edits: [{ line, col, endLine, endCol, text }] }]
//       d: a diagnostic of the file ({ line, col, message, check }); modules: the project's modules
//       ({ name, ports: [names], params: [names] }) for a misspelt module or port name
//   applyFix(text, fix) -> the text with the fix applied
//
// The fixes (the messages they answer are explained in core/hints.js):
//  - a misspelt name -> the declared name(s) nearest to it (edit distance) of the same kind of
//    object (a signal / port / constant…, a function, a type, a module, a port of the instance);
//  - an undeclared signal that is assigned -> its declaration: VHDL `signal x : <type>;` before the
//    `begin` of the architecture, Verilog `wire` / `reg` after the module header, the type / width
//    from the assignment (only when it is clear from it);
//  - a ';' missing at the end of a line;
//  - a missing end (`end if;`, `end process;`, `end case;`… the end of a unit; Verilog `end`,
//    `endcase`, `endmodule`…): only for the first syntax error of the file (the next ones follow
//    from it), where the open constructs (core/scopes.js) show what is not closed;
//  - VHDL: a vector assigned to one of another width (zero-extend / resize / keep the low bits), a
//    missing `use ieee.numeric_std.all;` / `use ieee.std_logic_1164.all;`, '=' for '<=' / ':=',
//    '<=' to a variable, an output port that is read (VHDL-93: an internal signal);
//  - Verilog: a procedural assignment to a wire (-> reg), a continuous one to a reg (-> wire), '=' /
//    '<=' in the wrong kind of always block, an incomplete event list (-> always @(*));
//  - VHDL: a signal missing from the sensitivity list of a process (-> added);
//  - VHDL: a function that is not pure (a warning, an error when written `pure`) -> declared
//    impure, also in its package declaration, when no other pure function calls it;
//  - VHDL: a statement label with the name of another declaration of its region -> the label
//    renamed to a free name (b1 -> b1_inst, p -> p_proc…), also after its `end process` / `end
//    generate` / `end block`; not when a configuration or attribute specification names it.
//
// Isomorphic module (browser + Node).

import { analyze, openScopes, visibleSymbols } from './scopes.js';
import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import { PURE_CHECK } from './vhdl/purity.js';
import { LABEL_CHECK } from './vhdl/labels.js';

const VHDL_TYPES = ['std_logic', 'std_logic_vector', 'std_ulogic', 'std_ulogic_vector', 'unsigned', 'signed', 'integer', 'natural', 'positive',
  'boolean', 'bit', 'bit_vector', 'time', 'string', 'real', 'character'];
const VHDL_FUNCS = ['rising_edge', 'falling_edge', 'to_unsigned', 'to_signed', 'to_integer', 'resize', 'std_logic_vector', 'unsigned', 'signed',
  'shift_left', 'shift_right', 'rotate_left', 'rotate_right', 'conv_integer', 'conv_std_logic_vector', 'to_stdlogicvector', 'to_bitvector'];
const VALUE_KINDS = new Set(['port', 'signal', 'variable', 'constant', 'generic', 'parameter', 'enum', 'loopvar', 'genvar', 'argument', 'alias']);
const VECTOR = /^(std_logic_vector|std_ulogic_vector|unsigned|signed|bit_vector)\s*\(\s*(\d+)\s+(downto|to)\s+(\d+)\s*\)$/i;

// the syntax errors of a source (not the pure-function errors the VHDL parser adds once it reads
// without them, nor its errors of labels), and those
const syntaxErrors = (text, lang) => (lang === 'vhdl' ? parseVhdl : parseVerilog)(text, 'f').errors.filter(e => e.severity !== 'warning' && e.check !== PURE_CHECK && e.check !== LABEL_CHECK);
const pureErrors = text => parseVhdl(text, 'f').errors.filter(e => e.check === PURE_CHECK);
const labelErrors = text => parseVhdl(text, 'f').errors.filter(e => e.check === LABEL_CHECK);

/** The text with the edits of a fix applied. */
export function applyFix(text, fix) {
  const ls = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') ls.push(i + 1);
  const off = (l, c) => (ls[l - 1] ?? text.length) + c - 1;
  const edits = fix.edits.map(e => ({ a: off(e.line, e.col), b: off(e.endLine ?? e.line, e.endCol ?? e.col), text: e.text })).sort((x, y) => y.a - x.a);
  let out = text;
  for (const e of edits) out = out.slice(0, e.a) + e.text + out.slice(e.b);
  return out;
}

// Optimal string alignment distance (a swap of two letters counts 1).
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The candidates nearest to a misspelt name (the best distance only, at most 3). */
export function nearestNames(name, candidates, lang) {
  const n = name.toLowerCase();
  const max = n.length <= 2 ? 0.5 : n.length <= 4 ? 1 : n.length <= 7 ? 2 : 3;   // (a name of 1 or 2 letters: only its case)
  const scored = [];
  for (const c of new Set(candidates)) {
    const cl = c.toLowerCase();
    if (lang === 'verilog' ? c === name : cl === n) continue;
    const dist = cl === n ? 0.5 : distance(n, cl);   // (Verilog: only the case differs)
    if (dist <= max && dist < Math.max(2, n.length / 2)) scored.push([dist, c]);
  }
  if (!scored.length) return [];
  const best = Math.min(...scored.map(s => s[0]));
  return scored.filter(s => s[0] === best).map(s => s[1]).sort().slice(0, 3);
}

// ------------------------------------------------------------------ context
function context(text, lang) {
  const lines = text.split('\n');
  let a = null, errs = null;
  const C = {
    text, lang, lines,
    get a() { return a || (a = analyze(text, lang)); },
    norm: s => (lang === 'verilog' ? String(s) : String(s).toLowerCase()),
    indent: l => /^[ \t]*/.exec(lines[l - 1] || '')[0],
    /** The syntax errors of the file (in order). */
    get errors() {
      if (!errs) { try { errs = syntaxErrors(text, lang); } catch { errs = []; } }
      return errs;
    },
    tok: i => C.a.tokens[i],
    tlen: t => t.len || String(t.v ?? '').length,
    replace: (t, s) => ({ line: t.line, col: t.col, endLine: t.line, endCol: t.col + C.tlen(t), text: s }),
    insertAt: (line, col, s) => ({ line, col, endLine: line, endCol: col, text: s }),
    lineBefore: (line, s) => ({ line, col: 1, endLine: line, endCol: 1, text: `${s}\n` }),
    /** Is token i the first one of its line? */
    firstOnLine: i => { const t = C.tok(i); return !/\S/.test((lines[t.line - 1] || '').slice(0, t.col - 1)); },
    /** Token indexes of a line. */
    lineTokens: l => C.a.tokens.map((t, i) => (t.line === l && t.k !== 'eof' ? i : -1)).filter(i => i >= 0),
  };
  return C;
}

const isKw = (t, ...v) => !!t && t.k === 'kw' && v.includes(t.v);
const isOp = (t, ...v) => !!t && t.k === 'op' && v.includes(t.v);
const q = s => `'${s}'`;

function matching(tokens, i) {
  const open = tokens[i].v, close = { '(': ')', '[': ']', '{': '}' }[open];
  for (let j = i, d = 0; j < tokens.length; j++) {
    if (isOp(tokens[j], open)) d++;
    else if (isOp(tokens[j], close) && --d === 0) return j;
  }
  return -1;
}

// ------------------------------------------------------------------ fixes
/** The quick fixes of a diagnostic (see the top of the file). */
export function quickFixes(text, lang, d, opts = {}) {
  if (!d || !d.message || (lang !== 'vhdl' && lang !== 'verilog')) return [];
  const C = context(text, lang);
  const msg = String(d.message);
  const out = [];
  for (const rule of RULES) {
    try { out.push(...(rule(C, d, msg, opts) || [])); } catch { /* no fix from this rule */ }
  }
  // the same result twice (two rules) is shown once
  const seen = new Set();
  return out.filter(f => { const k = applyFix(text, f); if (seen.has(k) || k === text) return false; seen.add(k); return true; });
}

const RULES = [notDeclared, unknownType, unknownUnit, missingSemicolon, missingEnd, widthMismatch, missingLibrary, assignOperator, variableAssign,
  modeOut, regWire, blockingKind, sensitivity, declareImpure, renameLabel];

// ---- a name that is not declared: the nearest declared one, or its declaration
function notDeclared(C, d, msg) {
  const m = /^'([^']+)' is not declared$|^implicit net '([^']+)'|^function '([^']+)' is not declared|^task\/procedure '([^']+)' is not declared/.exec(msg);
  if (!m) return;
  const name = m[1] || m[2] || m[3] || m[4];
  const { a } = C;
  const key = C.norm(name);
  const unbound = a.occs.filter(o => o.ref && !o.sym && o.key === key);
  if (!unbound.length) return;
  const near = unbound.filter(o => o.line >= d.line && o.line <= d.line + 3);
  const o0 = near[0] || unbound[0];
  const call = isOp(C.tok(o0.i + 1), '(');
  const kinds = m[3] ? ['function'] : m[4] ? ['procedure', 'task'] : [...VALUE_KINDS, ...(call ? ['function'] : [])];
  const fixes = [];
  const vis = visibleSymbols(a, o0.i).filter(s => kinds.includes(s.kind)).map(s => s.name);
  const builtin = C.lang === 'vhdl' && (call || m[3]) ? VHDL_FUNCS : [];
  for (const cand of nearestNames(name, [...vis, ...builtin], C.lang)) {
    const ck = C.norm(cand);
    const where = unbound.filter(o => a.lookupAt(o.i, ck) || builtin.includes(cand));
    fixes.push({ title: `Change ${q(name)} to ${q(cand)}`, edits: where.map(o => C.replace(C.tok(o.i), cand)) });
  }
  if (!m[3] && !m[4]) { const f = declareFix(C, name, unbound); if (f) fixes.push(f); }
  return fixes;
}

// the declaration of an undeclared name that the design assigns
function declareFix(C, name, unbound) {
  const { a } = C;
  const T = a.tokens;
  if (C.lang === 'vhdl') {
    // x <= … at the start of a statement, in an architecture
    const target = unbound.find(o => isOp(T[o.i + 1], '<=') && (o.i === 0 || isOp(T[o.i - 1], ';', ':', '=>') || isKw(T[o.i - 1], 'begin', 'then', 'else', 'generate', 'loop')));
    const anyUse = target || unbound[0];
    const arch = openScopes(a, anyUse.i).find(s => s.kind === 'architecture');
    if (!target || !arch) return null;
    let type = vhdlTypeOf(C, rhs(C, target.i + 2));
    // else from where it is read: y <= x;   if x = '1'
    for (const o of unbound) {
      if (type) break;
      if (isOp(T[o.i - 1], '<=') && isOp(T[o.i + 1], ';') && T[o.i - 2]?.k === 'id') type = a.occAt(o.i - 2)?.sym?.type || null;
      else if (isOp(T[o.i + 1], '=') && T[o.i + 2]?.lt === 'char') type = 'std_logic';
    }
    if (!type) return null;
    const edit = archDeclaration(C, arch, `signal ${name} : ${type};`);
    return edit && { title: `Declare ${q(`signal ${name} : ${type}`)}`, edits: [edit] };
  }
  // Verilog: assign x = …  (wire), x = … / x <= … in an always / initial block (reg)
  let target = unbound.find(o => isKw(T[o.i - 1], 'assign') && isOp(T[o.i + 1], '='));
  let net = 'wire';
  if (!target) {
    const proc = procAssignLines(C);
    target = unbound.find(o => isOp(T[o.i + 1], '=', '<=') && proc.has(`${o.line}:${o.name}`));
    net = 'reg';
  }
  if (!target) return null;
  const mod = openScopes(a, target.i).find(s => s.kind === 'module');
  if (!mod) return null;
  const width = vlogWidthOf(C, rhs(C, target.i + 2));
  if (width == null) return null;
  const decl = `${net} ${width ? `${width} ` : ''}${name};`;
  const edit = moduleDeclaration(C, mod, decl);
  return edit && { title: `Declare ${q(decl.slice(0, -1))}`, edits: [edit] };
}

// the targets of the procedural assignments of a Verilog source ("line:name"), from its parse
function procAssignLines(C) {
  const out = new Set();
  let parsed;
  try { parsed = parseVerilog(C.text, 'f'); } catch { return out; }
  const visit = s => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s)) { s.forEach(visit); return; }
    if (s.kind === 'assign' && s.target?.op === 'ref' && s.loc) out.add(`${s.loc.line}:${s.target.name}`);
    for (const k of ['body', 'then', 'else', 'items', 'stmts', 'stmt']) if (s[k]) visit(s[k]);
  };
  for (const u of parsed.units || []) for (const it of u.items || []) if (it.kind === 'process') visit(it.body);
  return out;
}

// tokens of the value of an assignment starting at i, up to ';' (VHDL: before `when` / `after`)
function rhs(C, i) {
  const T = C.a.tokens, out = [];
  for (let d = 0; i < T.length && T[i].k !== 'eof'; i++) {
    const t = T[i];
    if (isOp(t, '(', '[', '{')) d++;
    else if (isOp(t, ')', ']', '}')) d--;
    if (d < 0 || (d === 0 && (isOp(t, ';') || isKw(t, 'when', 'after')))) break;
    out.push(i);
  }
  return out;
}

// split token indexes at the operators of the top level
function splitTop(C, idx, isSep) {
  const T = C.a.tokens, parts = [[]];
  let d = 0;
  for (const i of idx) {
    const t = T[i];
    if (isOp(t, '(', '[', '{')) d++;
    else if (isOp(t, ')', ']', '}')) d--;
    if (d === 0 && isSep(t)) { parts.push([]); continue; }
    parts[parts.length - 1].push(i);
  }
  return parts;
}

// the VHDL type of an expression when it is clear: a literal, a name, a slice / index of a vector,
// a conversion of a vector, logic of names of one type
function vhdlTypeOf(C, idx) {
  const T = C.a.tokens;
  while (idx.length && isKw(T[idx[0]], 'not')) idx = idx.slice(1);
  if (!idx.length) return null;
  const t0 = T[idx[0]];
  const symOf = i => C.a.occAt(i)?.sym || null;
  if (idx.length === 1) {
    if (t0.lt === 'char') return 'std_logic';
    if ((t0.lt === 'str' && /^[01]+$/.test(t0.v)) || t0.lt === 'bitstr') return `std_logic_vector(${String(t0.v).length - 1} downto 0)`;
    if (t0.k === 'id') return symOf(idx[0])?.type || null;
    return null;
  }
  if (t0.k === 'id' && isOp(T[idx[1]], '(') && matching(T, idx[1]) === idx[idx.length - 1]) {
    const inner = idx.slice(2, -1);
    const base = symOf(idx[0])?.type;
    const vm = base && VECTOR.exec(base);
    // a(3) / a(7 downto 4) of a vector
    if (vm && inner.length === 1 && T[inner[0]].num) return 'std_logic';
    if (vm && inner.length === 3 && T[inner[0]].num && isKw(T[inner[1]], 'downto', 'to') && T[inner[2]].num) return `${vm[1]}(${Math.abs(+T[inner[0]].v - +T[inner[2]].v)} downto 0)`;
    // std_logic_vector(x) / unsigned(x) / signed(x) of a vector
    const conv = /^(std_logic_vector|unsigned|signed|std_ulogic_vector)$/i.exec(t0.v);
    if (conv && !symOf(idx[0]) && inner.length === 1 && T[inner[0]].k === 'id') {
      const vt = VECTOR.exec(symOf(inner[0])?.type || '');
      if (vt) return `${conv[1].toLowerCase()}(${vt[2]} ${vt[3].toLowerCase()} ${vt[4]})`;
    }
    return null;
  }
  // logic (and arithmetic) of operands of one type
  const parts = splitTop(C, idx, t => isKw(t, 'and', 'or', 'xor', 'nand', 'nor', 'xnor') || isOp(t, '+', '-'));
  if (parts.length < 2) return null;
  const types = parts.map(p => vhdlTypeOf(C, p));
  return types.every(x => x && x === types[0]) ? types[0] : null;
}

// the width of a Verilog expression as a range ('[3:0]', '' for one bit) when it is clear, else null
function vlogWidthOf(C, idx) {
  const T = C.a.tokens;
  const n = r => { const m = /^\[\s*(\d+)\s*:\s*(\d+)\s*\]$/.exec(r || ''); return m ? Math.abs(+m[1] - +m[2]) + 1 : null; };
  const range = w => (w === 1 ? '' : `[${w - 1}:0]`);
  if (!idx.length) return null;
  // comparisons and logical operators give one bit
  if (splitTop(C, idx, t => isOp(t, '==', '!=', '===', '!==', '<', '>', '<=', '>=', '&&', '||')).length > 1) return '';
  if (isOp(T[idx[0]], '!')) return '';
  if (isOp(T[idx[0]], '~', '-')) idx = idx.slice(1);
  // c ? a : b
  const tern = splitTop(C, idx, t => isOp(t, '?'));
  if (tern.length === 2) {
    const ab = splitTop(C, tern[1], t => isOp(t, ':'));
    if (ab.length !== 2) return null;
    const wa = vlogWidthOf(C, ab[0]), wb = vlogWidthOf(C, ab[1]);
    return wa != null && wa === wb ? wa : null;
  }
  const parts = splitTop(C, idx, t => isOp(t, '&', '|', '^', '~^', '+', '-'));
  if (parts.length > 1) {
    const ws = parts.map(p => vlogWidthOf(C, p));
    return ws.every(w => w != null && w === ws[0]) ? ws[0] : null;
  }
  const t0 = T[idx[0]];
  if (idx.length === 1) {
    if (t0.lt === 'based' && t0.size) return range(t0.size);
    const s = t0.k === 'id' ? C.a.occAt(idx[0])?.sym : null;
    return s && s.vtype ? (s.vtype.range || '') : null;
  }
  // a[3] / a[7:4]
  if (t0.k === 'id' && isOp(T[idx[1]], '[') && matching(T, idx[1]) === idx[idx.length - 1]) {
    const inner = idx.slice(2, -1);
    if (inner.length === 1) return '';
    if (inner.length === 3 && T[inner[0]].lt === 'int' && isOp(T[inner[1]], ':') && T[inner[2]].lt === 'int') return range(Math.abs(+T[inner[0]].v - +T[inner[2]].v) + 1);
    return null;
  }
  // {a, b, 2'b00}
  if (isOp(t0, '{') && matching(T, idx[0]) === idx[idx.length - 1]) {
    const ws = splitTop(C, idx.slice(1, -1), t => isOp(t, ',')).map(p => { const w = vlogWidthOf(C, p); return w == null ? null : w === '' ? 1 : n(w); });
    return ws.every(w => w) ? range(ws.reduce((x, y) => x + y, 0)) : null;
  }
  return null;
}

// a declaration in the declarative part of an architecture (a line before its `begin`)
function archDeclaration(C, arch, decl) {
  const T = C.a.tokens;
  let b = -1;
  for (let j = arch.tok + 1; j < T.length && T[j].k !== 'eof'; j++) if (isKw(T[j], 'begin') && C.a.scopeAt(j) === arch) { b = j; break; }
  if (b < 0) return null;
  const bt = T[b];
  if (!C.firstOnLine(b)) return C.insertAt(bt.line, bt.col, `${decl} `);
  // the indentation of the declaration above, else of `begin` and two spaces more
  const prev = T[b - 1];
  const ind = prev && prev.line > T[arch.tok].line && C.firstOnLine(firstOfLine(C, prev.line)) ? C.indent(prev.line) : `${C.indent(bt.line)}  `;
  return C.lineBefore(bt.line, `${ind}${decl}`);
}
function firstOfLine(C, line) { return C.lineTokens(line)[0] ?? 0; }

// a declaration after the header of a Verilog module (after the ';' that ends it)
function moduleDeclaration(C, mod, decl) {
  const T = C.a.tokens;
  let semi = -1;
  for (let j = mod.tok + 1, d = 0; j < T.length && T[j].k !== 'eof'; j++) {
    if (isOp(T[j], '(', '[', '{')) d++;
    else if (isOp(T[j], ')', ']', '}')) d--;
    else if (d === 0 && isOp(T[j], ';')) { semi = j; break; }
  }
  if (semi < 0) return null;
  const st = T[semi];
  const rest = (C.lines[st.line - 1] || '').slice(st.col);
  if (/\S/.test(rest.replace(/\/\/.*$/, ''))) return C.insertAt(st.line, st.col + 1, ` ${decl}`);
  const nx = T[semi + 1];
  const ind = nx && nx.k !== 'eof' && !isKw(nx, 'endmodule') ? C.indent(nx.line) : `${C.indent(T[mod.tok].line)}  `;
  return C.insertAt(st.line, (C.lines[st.line - 1] || '').length + 1, `\n${ind}${decl}`);
}

// ---- an unknown VHDL type: the nearest type
function unknownType(C, d, msg) {
  const m = /^unknown type '([^']+)'/.exec(msg);
  if (!m) return;
  const key = C.norm(m[1]);
  const occ = C.a.occs.filter(o => o.ref && !o.sym && o.key === key);
  const o0 = occ.find(o => o.line >= d.line) || occ[0];
  if (!o0) return;
  const types = visibleSymbols(C.a, o0.i).filter(s => s.kind === 'type' || s.kind === 'subtype').map(s => s.name);
  return nearestNames(m[1], [...types, ...(C.lang === 'vhdl' ? VHDL_TYPES : [])], C.lang)
    .map(c => ({ title: `Change ${q(m[1])} to ${q(c)}`, edits: occ.map(o => C.replace(C.tok(o.i), c)) }));
}

// ---- an unknown module / port of an instance: the nearest name of the project
function unknownUnit(C, d, msg, { modules = [] }) {
  let m = /^module\/entity '([^']+)' not found \(instance '([^']+)'\)/.exec(msg);
  if (m) {
    const key = C.norm(m[1]);
    const occ = C.a.occs.filter(o => o.key === key && !o.decl && o.line >= d.line && o.line <= d.line + 3).slice(0, 1);
    if (!occ.length) return;
    return nearestNames(m[1], modules.map(x => x.name), C.lang).map(c => ({ title: `Change ${q(m[1])} to ${q(c)}`, edits: occ.map(o => C.replace(C.tok(o.i), c)) }));
  }
  m = /^module '([^']+)' has no port '([^']+)'/.exec(msg);
  if (m) {
    const mod = modules.find(x => C.norm(x.name) === C.norm(m[1]));
    const key = C.norm(m[2]);
    const occ = C.a.occs.filter(o => o.ext && C.norm(o.ext.unit) === C.norm(m[1]) && o.key === key && o.line >= d.line && o.line <= d.line + 6);
    if (!mod || !occ.length) return;
    return nearestNames(m[2], [...(mod.ports || []), ...(mod.params || [])], C.lang)
      .map(c => ({ title: `Change ${q(m[2])} to ${q(c)}`, edits: occ.slice(0, 1).map(o => C.replace(C.tok(o.i), c)) }));
  }
}

// ---- expected ';' after 'x': at the end of the code of that line. Else, for the first syntax error
// of the file when it is at the start of a line (the statement above not ended: `expected 'end'
// but found 'when'`, `expected ')' but found ':'` in a port list…): a ';' at the end of the line
// above, when the parser then finds fewer errors and none before
function missingSemicolon(C, d, msg) {
  // a ';' at the end of the code of a line (before a comment and the spaces at the end)
  const at = line => {
    const L = C.lines[line - 1];
    const code = L == null ? '' : L.replace(C.lang === 'vhdl' ? /\s*--.*$/ : /\s*\/\/.*$/, '').replace(/\s+$/, '');
    if (!code.trim() || /[;(,]$/.test(code) || /["']/.test(L.slice(code.length))) return null;
    return { title: "Add ';' at the end of the line", edits: [C.insertAt(line, code.length + 1, ';')] };
  };
  if (/^expected ';' after /.test(msg)) { const f = at(d.line); return f && [f]; }
  const first = C.errors[0];
  if (!first || first.line !== d.line || first.message !== msg || !/^(expected|unexpected) /.test(msg)) return;
  const T = C.a.tokens;
  // the line above the error (a port list: `b : in bit` after `a : in bit` without ';'), or its own
  const j = C.lineTokens(d.line)[0];
  const lines = [d.line];
  if (j > 0 && !isOp(T[j - 1], ';', '(', ',')) lines.unshift(T[j - 1].line);
  for (const line of lines) {
    const fix = at(line);
    if (!fix) continue;
    let after;
    try { after = syntaxErrors(applyFix(C.text, fix), C.lang); } catch { continue; }
    if (after.length < C.errors.length && !(after[0] && after[0].line <= d.line)) return [fix];
  }
}

// ---- a missing end: for the first syntax error of the file only
const V_CLOSER_OF = { block: 'end', module: 'endmodule', case: 'endcase', function: 'endfunction', task: 'endtask', generate: 'endgenerate', fork: 'join', specify: 'endspecify', package: 'endpackage' };
const V_CLOSES = { end: 'block', endmodule: 'module', endcase: 'case', endfunction: 'function', endtask: 'task', endgenerate: 'generate', join: 'fork', endspecify: 'specify' };
function vhdlCloser(s) {
  if (s.kind === 'architecture' || s.kind === 'entity') return `end ${s.sym?.name || s.kind};`;
  if (s.kind === 'package') return 'end package;';
  if (s.kind === 'subprogram') return `end ${s.closer};`;
  return `end ${s.closer};`;
}
function missingEnd(C, d, msg) {
  const first = C.errors.filter(e => !/^expected ';' after /.test(e.message))[0];
  if (!first || first.line !== d.line || first.message !== msg) return;
  const { a } = C;
  const T = a.tokens;
  const eof = T.length - 1;
  const closer = s => (C.lang === 'vhdl' ? vhdlCloser(s) : V_CLOSER_OF[s.kind]);
  const lines = list => list.map(s => `${C.indent(T[s.tok].line)}${closer(s)}`);
  // at the end of the file: everything still open is closed there
  if (/but found (end of file|'eof')$/.test(msg)) {
    const open = openScopes(a, eof);
    if (!open.length || open.some(s => !closer(s))) return;
    const add = lines(open);
    const nl = C.text.endsWith('\n') ? '' : '\n';
    const lastLine = C.lines.length;
    return [{ title: `Add ${add.map(s => q(s.trim())).join(', ')} at the end`, edits: [C.insertAt(lastLine, C.lines[lastLine - 1].length + 1, `${nl}${add.join('\n')}\n`)] }];
  }
  const i = a.tokenAtPos(d.line, d.col);
  let fix = null, at = i;   // the end where the parser saw that something is not closed
  const t = T[i];
  const m = /^expected '(if|case|loop|process|generate|component|record|units|block)' but found /.exec(msg);
  const w = t && (t.k === 'kw' || t.k === 'id') && t.line === d.line ? t.v : null;
  if (C.lang === 'vhdl' && m && isKw(T[i - 1], 'end')) {
    const x = m[1];
    at = i - 1;
    const opener = openScopes(a, i - 1).find(s => s.closer === x);
    // `end;` / `end label;` of the construct, and nothing left open: the word is missing
    if (!openScopes(a, eof).length && (isOp(T[i], ';') || T[i].k === 'id')) {
      return [{ title: `Write ${q(`end ${x}`)}`, edits: [C.insertAt(T[i - 1].line, T[i - 1].col + 3, ` ${x}`)] }];
    }
    const ind = opener ? C.indent(T[opener.tok].line) : `${C.indent(T[i - 1].line)}  `;
    const e = C.firstOnLine(i - 1) ? C.lineBefore(T[i - 1].line, `${ind}end ${x};`) : C.insertAt(T[i - 1].line, T[i - 1].col, `end ${x}; `);
    fix = { title: `Insert ${q(`end ${x};`)}`, edits: [e] };
  } else if (C.lang === 'verilog' && w in V_CLOSES) {
    // Verilog: a closer word that closes an outer construct: the inner ones are not closed
    const open = openScopes(a, i);
    const k = open.findIndex(s => s.kind === V_CLOSES[w]);
    if (k <= 0) return;
    const add = open.slice(0, k);
    const e = C.firstOnLine(i) ? C.lineBefore(t.line, lines(add).join('\n')) : C.insertAt(t.line, t.col, `${add.map(closer).join(' ')} `);
    fix = { title: `Insert ${add.map(s => q(closer(s))).join(', ')}`, edits: [e] };
  } else {
    // a statement / module item at the start of a line that the open construct cannot hold
    // (`expected 'end' but found 'when'`, `… but found 'always'`): what is open is not closed
    if (!t || !C.firstOnLine(i) || !/^(expected|unexpected) /.test(msg)) return;
    const open = openScopes(a, i).filter(s => C.lang === 'vhdl' || s.kind !== 'module');
    const add = C.lang === 'vhdl' ? open.slice(0, 1) : open;
    if (/^expected 'end\w*' but found /.test(msg) && add.length && add.every(closer)) fix = { title: `Insert ${add.map(s => q(closer(s))).join(', ')}`, edits: [C.lineBefore(t.line, lines(add).join('\n'))] };
  }
  // where the indentation says the construct ends, when it does, else just before that end; and
  // only a fix after which the parser finds fewer errors
  const fewer = f => { try { return syntaxErrors(applyFix(C.text, f), C.lang).length < C.errors.length; } catch { return false; } };
  const guided = byIndentation(C, at, closer);
  return [guided, fix].filter(f => f && fewer(f)).slice(0, 1);
}

// The constructs before token `upto` that the indentation shows not closed: a line after the
// opening one, indented as much as it or less, that is not its end (nor its elsif / else / when /
// begin, nor a closing bracket): the end goes before that line, indented as the opening one.
function byIndentation(C, upto, closer) {
  const { a } = C;
  const T = a.tokens;
  const opened = new Map();   // line -> the constructs opened on it
  for (const s of a.scopes) opened.set(T[s.tok].line, (opened.get(T[s.tok].line) || 0) + 1);
  const skip = /^\s*($|--|\/\/|`|[)\]};])/;
  const edits = [], names = [];
  for (const s of a.scopes) {
    if (s.tok >= upto) break;
    const l0 = T[s.tok].line;
    if (opened.get(l0) !== 1 || (s.end != null && T[s.end].line === l0) || !closer(s)) continue;
    const ind = C.indent(l0).length;
    const end = C.lang === 'vhdl' ? /^\s*end\b/i : new RegExp(`^\\s*${closer(s)}\\b`);
    const cont = C.lang !== 'vhdl' ? null : s.kind === 'if' ? /^\s*(elsif|else)\b/i : s.kind === 'case' ? /^\s*when\b/i : /^\s*begin\b/i;
    let L = 0;
    for (let l = l0 + 1; l <= C.lines.length && !L; l++) {
      const x = C.lines[l - 1];
      if (skip.test(x) || C.indent(l).length > ind || (cont && cont.test(x) && C.indent(l).length === ind)) continue;
      L = l;
    }
    if (!L || L > T[upto].line || (C.indent(L).length === ind && end.test(C.lines[L - 1]))) continue;
    // (after the last line of the construct: before the blank lines and comments that follow it)
    while (L - 1 > l0 && /^\s*($|--|\/\/)/.test(C.lines[L - 2]) && C.indent(L - 1).length <= ind) L--;
    edits.push(C.lineBefore(L, `${C.indent(l0)}${closer(s)}`));
    names.push(closer(s));
  }
  return edits.length ? { title: `Insert ${names.map(q).join(', ')}`, edits } : null;
}

// ---- VHDL: width mismatch in `y <= a;`
function widthMismatch(C, d, msg) {
  const m = /^width mismatch: target is (\d+) bits, value is (\d+) bits/.exec(msg);
  if (!m || C.lang !== 'vhdl') return;
  const tw = +m[1], vw = +m[2];
  const T = C.a.tokens;
  for (const i of C.lineTokens(d.line)) {
    // target <= value ;  (one name each, on this line)
    if (T[i].k !== 'id' || !isOp(T[i + 1], '<=') || T[i + 2]?.k !== 'id' || !isOp(T[i + 3], ';')) continue;
    const ts = C.a.occAt(i)?.sym, vs = C.a.occAt(i + 2)?.sym;
    const tm = VECTOR.exec(ts?.type || ''), vm = VECTOR.exec(vs?.type || '');
    if (!tm || !vm) continue;
    const v = T[i + 2];
    const lo = +vm[4], down = vm[3].toLowerCase() === 'downto';
    const numeric = /^(un)?signed$/i;
    if (tw > vw) {
      if (numeric.test(vm[1]) && vm[1].toLowerCase() === tm[1].toLowerCase() && /numeric_std/i.test(C.text)) {
        return [{ title: `Resize: resize(${v.v}, ${tw})`, edits: [C.replace(v, `resize(${v.v}, ${tw})`)] }];
      }
      if (/^signed$/i.test(vm[1]) || vm[1].toLowerCase() !== tm[1].toLowerCase()) return;
      const zeros = `"${'0'.repeat(tw - vw)}" & ${v.v}`;
      return [{ title: `Extend with zeros: ${zeros}`, edits: [C.replace(v, zeros)] }];
    }
    if (tw < vw && vm[1].toLowerCase() === tm[1].toLowerCase() && down) {
      const slice = `${v.v}(${lo + tw - 1} downto ${lo})`;
      return [{ title: `Keep the low bits: ${slice}`, edits: [C.replace(v, slice)] }];
    }
    return;
  }
}

// ---- VHDL: numeric_std / std_logic_1164 not declared
function missingLibrary(C, d, msg) {
  const m = /^<(\w+)> is not declared\.$/.exec(msg);
  if (!m || C.lang !== 'vhdl' || (d.check && d.check !== 'missing-library')) return;
  const std = /^std_u?logic(_vector)?$/i.test(m[1]);
  const clause = std ? 'use ieee.std_logic_1164.all;' : 'use ieee.numeric_std.all;';
  const after = std ? /^\s*library\s+ieee\s*;\s*(--.*)?$/i : /^\s*use\s+ieee\s*\.\s*std_logic_1164\s*\.\s*all\s*;\s*(--.*)?$/i;
  const edits = [];
  C.lines.forEach((l, k) => { if (after.test(l)) edits.push(C.insertAt(k + 1, l.length + 1, `\n${C.indent(k + 1)}${clause}`)); });
  if (!edits.length) {
    // no library clause: before the first line of the design
    const t0 = C.a.tokens.find(t => t.k !== 'eof');
    if (!t0) return;
    edits.push(C.lineBefore(t0.line, `library ieee;\n${clause}`));
  }
  return [{ title: `Add ${q(clause)}`, edits }];
}

// ---- VHDL: '=' instead of '<=' / ':='
function assignOperator(C, d, msg) {
  if (C.lang !== 'vhdl' || !/^expected '<='(, ':=' or ';')? but found '='$/.test(msg)) return;
  const i = C.a.tokenAtPos(d.line, d.col);
  const T = C.a.tokens;
  if (!isOp(T[i], '=') || T[i].line !== d.line) return;
  let j = i - 1;
  if (isOp(T[j], ')')) { let dd = 0; for (; j >= 0; j--) { if (isOp(T[j], ')')) dd++; else if (isOp(T[j], '(') && --dd === 0) { j--; break; } } }
  const target = C.a.occAt(j)?.sym;
  const op = target?.kind === 'variable' ? ':=' : '<=';
  return [{ title: `Use ${q(op)} to assign (${q('=')} compares)`, edits: [C.replace(T[i], op)] }];
}

// ---- VHDL: '<=' to a variable
function variableAssign(C, d, msg) {
  const m = /^'([^']+)' is a variable: use ':='/.exec(msg);
  if (!m || C.lang !== 'vhdl') return;
  const T = C.a.tokens;
  const key = C.norm(m[1]);
  for (const i of C.lineTokens(d.line)) {
    if (T[i].key !== key) continue;
    let j = i + 1;
    if (isOp(T[j], '(')) j = matching(T, j) + 1;
    if (isOp(T[j], '<=')) return [{ title: `Use ':=' to assign the variable ${q(m[1])}`, edits: [C.replace(T[j], ':=')] }];
  }
}

// ---- VHDL-93: an output port that is read -> an internal signal, assigned to the port
function modeOut(C, d, msg) {
  const m = /^Object <([^>]+)> of mode OUT can not be read\./.exec(msg);
  if (!m || C.lang !== 'vhdl') return;
  const { a } = C;
  const port = a.symbols.find(s => s.kind === 'port' && s.key === C.norm(m[1]) && s.scope.kind === 'entity' && s.mode === 'out' && s.type);
  if (!port) return;
  const ent = port.scope;
  const archs = a.symbols.filter(s => s.kind === 'architecture' && s.owner?.parent === ent);
  if (archs.length !== 1) return;
  const arch = archs[0].owner;
  const T = a.tokens;
  // a name not used anywhere in the file
  const used = new Set(a.occs.map(o => o.key));
  const name = [`${port.name}_int`, `${port.name}_i`, `${port.name}_reg`].find(n => !used.has(C.norm(n)));
  if (!name || arch.end == null) return;
  const inArch = port.occs.filter(o => !o.decl && o.i > arch.tok && o.i < arch.end);
  if (!inArch.length) return;
  const decl = archDeclaration(C, arch, `signal ${name} : ${port.type};`);
  const end = T[arch.end];
  if (!decl || !C.firstOnLine(arch.end)) return;
  // the statements' indentation: of the line after `begin`
  const ind = `${C.indent(end.line)}  `;
  return [{
    title: `Use an internal signal ${q(name)} (and ${port.name} <= ${name})`,
    edits: [decl, ...inArch.map(o => C.replace(T[o.i], name)), C.lineBefore(end.line, `${ind}${port.name} <= ${name};`)],
  }];
}

// ---- Verilog: reg / wire of a declaration
function regWire(C, d, msg) {
  if (C.lang !== 'verilog') return;
  let m = /^Procedural assignment to a non-register <([^>]+)>/.exec(msg);
  const toReg = !!m;
  if (!m) m = /^Target <([^>]+)> of concurrent assignment or output port connection should be a net type/.exec(msg);
  if (!m || /[.[]/.test(m[1])) return;
  const { a } = C;
  const T = a.tokens;
  const o = a.occs.find(x => x.key === m[1] && x.sym && x.line >= d.line) || a.occs.find(x => x.key === m[1] && x.sym);
  const sym = o?.sym;
  if (!sym) return;
  for (const dc of sym.occs.filter(x => x.decl)) {
    // the words before the name: input/output … wire/reg … signed [range]; only this name declared
    let j = dc.i - 1;
    const words = [];
    for (; j >= 0; j--) {
      if (isOp(T[j], ']')) { let dd = 0; for (; j >= 0; j--) { if (isOp(T[j], ']')) dd++; else if (isOp(T[j], '[') && --dd === 0) break; } continue; }
      if (isKw(T[j], 'input', 'output', 'inout', 'wire', 'reg', 'logic', 'tri', 'signed', 'unsigned')) { words.unshift(j); continue; }
      break;
    }
    if (!words.length) continue;
    let k = dc.i + 1;
    if (isOp(T[k], '[')) k = matching(T, k) + 1;
    const alone = isOp(T[k], ';', ')') || (isOp(T[k], ',') && isKw(T[k + 1], 'input', 'output', 'inout'));
    if (!alone) continue;
    const w = words.map(x => T[x]);
    if (toReg) {
      const wire = words.find(x => isKw(T[x], 'wire', 'tri', 'logic'));
      if (wire != null) return [{ title: `Declare ${q(sym.name)} as reg`, edits: [C.replace(T[wire], 'reg')] }];
      const dir = words.find(x => isKw(T[x], 'output'));
      if (dir != null && !w.some(t => isKw(t, 'reg'))) return [{ title: `Declare ${q(sym.name)} as reg`, edits: [C.insertAt(T[dir].line, T[dir].col + 6, ' reg')] }];
    } else {
      const reg = words.find(x => isKw(T[x], 'reg'));
      if (reg != null && !isOp(T[k], '=')) return [{ title: `Declare ${q(sym.name)} as wire`, edits: [C.replace(T[reg], 'wire')] }];
    }
  }
}

// ---- Verilog: '=' in a clocked always block / '<=' in a combinational one
function blockingKind(C, d, msg) {
  if (C.lang !== 'verilog') return;
  const b = /^Blocking assignment \(=\) to <([^>]+)> in a clocked always block/.exec(msg);
  const nb = /^Non-blocking assignment \(<=\) to <([^>]+)> in a combinational always block/.exec(msg);
  const m = b || nb;
  if (!m || /[.[]/.test(m[1])) return;
  const from = b ? '=' : '<=', to = b ? '<=' : '=';
  const { a } = C;
  const T = a.tokens;
  const at = a.occs.find(o => o.key === m[1] && o.line === d.line && assignOp(T, o.i, from));
  if (!at) return;
  // every such assignment to it in the same always block (its begin … end), else just this one
  const blocks = openScopes(a, at.i).filter(s => s.kind === 'block');
  const body = blocks[blocks.length - 1];
  const all = body && body.end != null ? a.occs.filter(o => o.sym === at.sym && o.i > body.tok && o.i < body.end && assignOp(T, o.i, from)) : [at];
  return [{ title: `Use ${q(to)} for ${q(m[1])}`, edits: all.map(o => C.replace(T[assignOp(T, o.i, from)], to)) }];
}
// index of the assignment operator after the target at i (a statement's target), or 0
function assignOp(T, i, op) {
  const p = T[i - 1];
  if (!(isOp(p, ';', ')', ':') || isKw(p, 'begin', 'else', 'end') || (isOp(p, '*') && isOp(T[i - 2], '@')))) return 0;
  let j = i + 1;
  if (isOp(T[j], '[')) j = matching(T, j) + 1;
  return isOp(T[j], op) ? j : 0;
}

// ---- a signal missing from the sensitivity list
function sensitivity(C, d, msg) {
  const { a } = C;
  const T = a.tokens;
  const toks = C.lineTokens(d.line);
  if (!toks.length) return;
  const mv = /^(\w+) should be on the sensitivity list of the process/.exec(msg);
  if (mv && C.lang === 'vhdl') {
    const pk = toks.find(i => isKw(T[i], 'process'));
    const proc = pk != null ? a.scopeAt(pk + 1) : openScopes(a, toks[0]).find(s => s.kind === 'process');
    if (!proc || proc.kind !== 'process') return;
    const open = proc.tok + 1;
    if (!isOp(T[open], '(')) return;
    const close = matching(T, open);
    if (close < 0 || T.slice(open, close).some(t => isKw(t, 'all'))) return;
    return [{ title: `Add ${q(mv[1])} to the sensitivity list`, edits: [C.insertAt(T[close].line, T[close].col, `, ${mv[1]}`)] }];
  }
  if (C.lang === 'verilog' && /^One or more signals are missing in the sensitivity list of always block/.test(msg)) {
    const al = toks.find(i => isKw(T[i], 'always'));
    if (al == null || !isOp(T[al + 1], '@') || !isOp(T[al + 2], '(')) return;
    const close = matching(T, al + 2);
    if (close < 0 || T.slice(al + 2, close).some(t => isKw(t, 'posedge', 'negedge'))) return;
    const s = T[al + 2], e = T[close];
    return [{ title: "Use 'always @(*)': every signal read is in the list", edits: [{ line: s.line, col: s.col, endLine: e.line, endCol: e.col + 1, text: '(*)' }] }];
  }
}

// ---- VHDL: a pure function that uses what is declared outside it -> `impure function` (its body and
// its declaration in a package or a declarative part), when the source then has no other error of
// pure functions (a pure function that calls it)
function declareImpure(C, d, msg) {
  const m = /^Function (\S+) is not pure: it /.exec(msg);
  if (!m || C.lang !== 'vhdl') return;
  const { a } = C;
  const T = a.tokens;
  const key = C.norm(m[1]);
  const isFn = s => s.kind === 'subprogram' && s.closer === 'function' && s.sym?.key === key;
  // (the message is at the `end` of its body)
  const body = a.scopes.find(s => isFn(s) && !s.specOnly && s.end != null && T[s.end].line === d.line);
  if (!body) return;
  // the header as written, from the name to `is` / `;` (an overloaded function: the declaration of this one)
  const header = (s) => {
    const out = [];
    for (let j = s.tok + 1, dd = 0; j < T.length && T[j].k !== 'eof'; j++) {
      if (isOp(T[j], '(')) dd++;
      else if (isOp(T[j], ')')) dd--;
      if (dd === 0 && (isKw(T[j], 'is') || isOp(T[j], ';'))) break;
      out.push(T[j].key ?? T[j].v);
    }
    return out.join(' ');
  };
  const decls = a.scopes.filter(s => isFn(s) && s.specOnly && (s.outer === body.outer || body.outer?.parent === s.outer) && header(s) === header(body));
  // `pure function` -> `impure function`, `function` -> `impure function`
  const edits = [];
  for (const s of [body, ...decls]) {
    const p = T[s.tok - 1];
    if (isKw(p, 'impure')) continue;
    edits.push(isKw(p, 'pure') ? C.replace(p, 'impure') : C.insertAt(T[s.tok].line, T[s.tok].col, 'impure '));
  }
  if (!edits.length) return;
  const fix = { title: `Declare the function ${q(m[1])} impure`, edits };
  // only when that makes it valid: no new error, none left in that function
  const before = new Set(pureErrors(C.text).map(e => `${e.line}:${e.message}`));
  const after = pureErrors(applyFix(C.text, fix));
  if (after.some(e => !before.has(`${e.line}:${e.message}`) || e.message.startsWith(`Function ${m[1]} is not pure`))) return;
  return [fix];
}

// ---- VHDL: a statement label with the name of another declaration of its region (#192) -> the label
// renamed to a free name, at its statement and after its `end process` / `end generate` / `end
// block`; not when another place names it (a configuration specification `for b1 : FD use …`, an
// attribute specification `attribute a of b1 : label is …`)
const LABEL_SUFFIX = { process: 'proc', instance: 'inst', generate: 'gen', block: 'blk' };
function renameLabel(C, d, msg) {
  const m = /^Redeclaration of symbol (\S+): the label of the ([a-z ]+) \(line (\d+)\)/.exec(msg);
  if (!m || C.lang !== 'vhdl') return;
  const T = C.a.tokens;
  const key = C.norm(m[1]), line = +m[3];
  // the label: `name :` at the start of a statement on its line
  const i = T.findIndex((t, k) => t.line === line && t.k === 'id' && t.key === key && isOp(T[k + 1], ':') && (k === 0 || isOp(T[k - 1], ';') || T[k - 1].k === 'kw'));
  if (i < 0) return;
  const toks = [i];
  // the same name after the `end` of its process / generate / block
  const s = C.a.scopes.find(x => x.tok > i && x.tok <= i + 3 && x.end != null);
  if (s && T[s.end + 1]?.k === 'kw' && T[s.end + 2]?.k === 'id' && T[s.end + 2].key === key) toks.push(s.end + 2);
  // named elsewhere in a specification (`for b1 : …`, `of b1 : label`): not renamed here
  for (let k = 0; k < T.length; k++) {
    if (toks.includes(k) || T[k].k !== 'id' || T[k].key !== key) continue;
    let j = k - 1;
    while (j >= 0 && (T[j].k === 'id' || isOp(T[j], ','))) j--;
    if (isKw(T[j], 'for', 'of') && isOp(T[k + 1], ':', ',')) return;
  }
  // a free name: not used in the file
  const used = new Set(T.filter(t => t.k === 'id').map(t => t.key));
  const base = `${T[i].v}_${LABEL_SUFFIX[m[2]] || 'label'}`;
  let name = base;
  for (let n = 2; used.has(C.norm(name)); n++) name = `${base}${n}`;
  const fix = { title: `Rename the label ${q(T[i].v)} to ${q(name)}`, edits: toks.map(k => C.replace(T[k], name)) };
  // only when that leaves no error of the label
  if (labelErrors(applyFix(C.text, fix)).some(e => C.norm(e.message).startsWith(`redeclaration of symbol ${C.norm(name)}:`))) return;
  return [fix];
}
