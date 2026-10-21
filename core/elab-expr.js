// Elaboration of expressions (#405: out of elaborate.js): an IR expression bound into an executable node (see the
// node kinds in elaborate.js's header): names resolved through the scopes (hierarchical ones too), operators typed and
// sized for Verilog and VHDL, slices, fields and packed elements, conversions, the built-in subprograms, function calls
// with their overloads and defaults, std.textio. elaborate.js imports bindExpr and the rest from here; this module
// takes the types, scopes and binders it needs from elaborate.js (the two only call each other: they load in either
// order).
import * as V from './values.js';
import { evalE, SimError, strToVal, bitpos } from './interp.js';
import { mapBits } from './vhdl/parser.js';
import {
  BIT, BOOL, CHAR, ElabError, FrameBuilder, INT, PHYS, REAL, STR, Scope, TIME, bindBlock, bindDecl, bindLvalue, cI,
  charConst, collectRW, constOf, containsKind, ctxSize, defaultValue, diag, dimsOf, elabType, enumChar, evalRange,
  fitVal, fold, isConstNode, isLvalueExpr, locNode, newSignal, probeCtx, scalarBounds, stdTypeName, strVec, vecT, walk,
} from './elaborate.js';

const ARITH = new Set(['+', '-', '*', '/', '%', 'mod', 'rem', '**']);
const BITWISE = new Set(['&', '|', '^', '~^', 'nand', 'nor']);
const CMP = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=']);
const SHIFT = new Set(['<<', '>>', '<<<', '>>>', 'rol', 'ror']);

function lookupOrErr(E, name, loc) {
  const e = E.sc.lookup(name);
  if (e) return e;
  return null;
}

// x'event / rising_edge(x) operand: a signal, or one bit of a vector signal (constant index)
function edgeOperand(node) {
  if (node && node.k === 'sig') return { sig: node.sig };
  if (node && node.k === 'bit' && node.base.k === 'sig' && node.index.k === 'c') return { sig: node.base.sig, bit: bitpos(node.base.t, V.toNum(node.index.val)) };
  return null;
}

// VHDL subprogram alias: the alias name stands for the subprogram (a user subprogram: the same
// entry; a built-in one: calls are redirected to its name)
export function defSubAlias(E, name, target) {
  const te = E.sc.lookup(target);
  E.sc.def(name, te && (te.kind === 'func' || te.kind === 'subalias') ? te : { kind: 'subalias', target });
}

function refNode(E, entry, name) {
  switch (entry.kind) {
    case 'sig': return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name };
    case 'const': return { k: 'c', val: entry.val, t: entry.t, name };
    case 'loc': return locNode(E, entry, name);
    case 'alias': return entry.rv;   // VHDL signal parameter: the actual signal itself
  }
  return null;
}

export function bindExpr(E, e, expect = null, loc) {
  const n = bindExpr0(E, e, expect, loc);
  return n;
}

function bindExpr0(E, e, expect, loc) {
  loc = e.loc || loc;
  switch (e.op) {
    case 'lit': {
      if (E.lang === 'vhdl' && expect && expect.char && e.scalar && e.ch) return charConst(e.ch);
      if (E.lang === 'vhdl' && expect && expect.kind === 'enum' && e.scalar && e.ch) { const c = enumChar(expect, e.ch); if (c) return c; }
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && e.text !== undefined) return { k: 'str', value: e.text, t: STR };
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && !e.scalar && /^[01]+$/.test(e.bits)) return { k: 'str', value: e.bits, t: STR };
      const val = V.fromBits(e.bits, !!e.signed);
      const t = e.scalar ? BIT : vecT(val.w, !!e.signed);
      if (E.lang === 'verilog' && e.sized === false && /^[xz]/.test(e.bits)) return { k: 'c', val, t, xext: e.bits[0] };
      if (E.lang === 'vhdl' && e.scalar && expect && expect.kind === 'logic' && expect.w > 1 && !expect.unconstrained) {
        // e.g. assigning '0' where a vector is expected is an error in VHDL; be lenient and extend
        return { k: 'c', val: V.resize(val, expect.w), t: expect };
      }
      if (E.lang === 'vhdl' && !e.scalar && e.sized) return { k: 'c', val, t, strText: e.text ?? e.bits };
      return { k: 'c', val, t };
    }
    case 'int': {
      const b = BigInt(e.value);
      if (E.lang === 'vhdl') return { k: 'c', val: V.mk(32, BigInt.asUintN(32, b), 0n, true), t: INT };
      let w = 32;
      while ((b >= 0n ? b >= 1n << BigInt(w - 1) : -b > 1n << BigInt(w - 1))) w += 32;
      return { k: 'c', val: V.mk(w, BigInt.asUintN(w, b), 0n, true), t: w === 32 ? INT : vecT(w, true) };
    }
    case 'real': return { k: 'c', val: V.real(e.value), t: REAL };
    case 'phys': {
      const ps = Math.round(e.value * (PHYS[e.unit] ?? 1));
      return { k: 'c', val: V.fromInt(ps, 64, true), t: TIME };
    }
    case 'str': {
      if (E.lang === 'verilog' && expect && expect.kind === 'logic') return { k: 'c', val: strToVal(e.value), t: vecT(Math.max(8, e.value.length * 8)) };
      if (E.lang === 'vhdl' && e.char && expect && expect.char) return charConst(e.value);
      if (E.lang === 'vhdl' && e.char && expect && expect.kind === 'enum') { const c = enumChar(expect, e.value); if (c) return c; }
      // a string where a vector is expected: std_logic characters only (XST rejects "1020X01Q")
      if (E.lang === 'vhdl' && expect && expect.kind === 'logic' && !e.char) {
        const wrong = [...e.value].find(c => !/^[01uxzwlh-]$/i.test(c));
        if (wrong !== undefined) throw new ElabError(`'${wrong}' is not a std_logic value (in the string "${e.value}")`, loc);
        return strAsLogic({ k: 'str', value: e.value, t: STR }, { t: expect });
      }
      return { k: 'str', value: e.value, t: STR };
    }
    case 'fill': {
      const w = expect ? expect.w : 1;
      const bit = e.bit;
      // ('0 '1 'x 'z: in a context-determined expression the fill extends to the context width)
      return { k: 'c', val: V.fromBits(bit.repeat(w)), t: expect || BIT, fillBit: bit };
    }
    case 'ref': {
      const entry = lookupOrErr(E, e.name, loc);
      if (entry?.kind === 'subalias') return bindExpr0(E, { ...e, name: entry.target }, expect, loc);
      if (entry) {
        const n = refNode(E, entry, e.name);
        if (n) return expect?.kind === 'logic' ? strVec(E, n) : n;
        if (entry.kind === 'func') return bindCall(E, entry, [], e.name, loc);
        if (entry.kind === 'type') throw new ElabError(`type '${e.name}' used as a value`, loc);
      }
      if (E.lang === 'vhdl' && e.name === 'now') return { k: 'now', t: TIME, unit: 1 };
      if (!entry && E.lang === 'verilog' && (e.path || e.name.includes('.'))) {
        const r = hierResolve(E, e.name, e.path, loc);
        if (r?.node) return r.node;
        if (r?.entry) {
          const n = refNode(E, r.entry, e.name);
          if (n) return n;
          if (r.entry.kind === 'func') return bindCall(E, r.entry, [], e.name, loc);
        }
      }
      if (E.implicitNets && E.lang === 'verilog' && E.inst && !e.name.includes('.')) {
        diag(E, `implicit net '${e.name}' (declare it with 'wire')`, loc, 'warning');
        const sig = newSignal(E, E.prefix + e.name, BIT, V.allX(1), 'signal', loc);
        E.sc.def(e.name, { kind: 'sig', sig, t: BIT });
        return { k: 'sig', sig, t: BIT, name: e.name };
      }
      if (e.name.includes('.')) {
        // a signal of a generate block of this instance (blk[2].t)
        const gs = E.inst.signals.find(x => x.name === E.prefix + e.name) || E.inst.signals.find(x => x.name === e.name);
        if (gs) return { k: 'sig', sig: gs, t: gs.t, name: e.name };
        const hs = hierLookup(E, e.name);
        if (hs) return hs.k === 'xloc' ? { ...hs, loc } : hs;
      }
      throw notDeclared(e.name, loc);
    }
    case 'index': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      return fold(indexNode(E, base, e.index, loc));
    }
    case 'slice': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      return fold(sliceNode(E, base, e.left, e.right, loc, e.dir));
    }
    case 'pslice': {
      const base = strVec(E, bindExpr(E, e.base, null, loc));
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      const start = bindExpr(E, e.start, null, loc);
      return fold({ k: 'pslice', base, start, dir: e.dir, t: vecT(w) });
    }
    case 'apply': return bindApply(E, e, expect, loc);
    case 'call': return bindVlogCall(E, e, expect, loc);
    case 'concat': {
      let parts = e.parts.map(p => bindExpr(E, p, null, loc));
      if (E.lang === 'vhdl' && parts.some(p => p.t.kind === 'str' || p.t.char)) {
        // "ab" & "-" & 'c': the string literals made of std_logic characters are strings here
        parts = parts.map((p, k) => (p.k === 'c' && p.t.kind === 'logic' && !p.src && (p.strText !== undefined || e.parts[k].ch)
          ? { k: 'str', value: p.strText ?? e.parts[k].ch, t: STR } : p));
        return { k: 'strcat', parts, t: STR };
      }
      if (E.lang === 'verilog') parts = parts.map(p => strVec(E, p));
      if (parts.some(p => p.t.kind === 'str')) return { k: 'strcat', parts, t: STR };
      if (parts.length === 1 && E.lang === 'verilog') return { k: 'conv', a: parts[0], ext: false, t: vecT(parts[0].t.w) };
      const w = parts.reduce((a, p) => a + p.t.w, 0);
      return fold({ k: 'cat', parts, t: vecT(w) });
    }
    case 'repl': {
      const count = bindExpr(E, e.count, null, loc);
      const n = V.toNum(constOf(E, count, loc));
      const a = bindExpr(E, e.value, null, loc);
      return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(n), t: INT }, a, t: vecT(n * a.t.w) });
    }
    case 'unary': {
      const a = bindExpr(E, e.a, expect, loc);
      let t;
      if (e.o === '+' && E.lang === 'vhdl') return a;
      if (a.t.kind === 'real' && (e.o === '-' || e.o === 'abs')) return fold({ k: 'un', o: e.o, a, t: REAL, fp: true });
      if (e.o === '~' || e.o === '-' || e.o === 'abs') t = a.t.kind === 'bool' ? BOOL : (a.t.kind === 'int' || a.t.kind === 'time' ? a.t : vecT(a.t.w, a.t.s));
      else t = E.lang === 'vhdl' && e.o === '!' ? BOOL : BIT;
      if (e.o === '~' && a.t.kind === 'logic' && a.t.scalar) t = BIT;
      return fold({ k: 'un', o: e.o, a, t });
    }
    case 'binary': return fold(bindBinary(E, e, expect, loc));
    case 'cond': {
      const c = bindExpr(E, e.cond, null, loc);
      let a = bindExpr(E, e.then, expect, loc), b = bindExpr(E, e.else, expect, loc);
      if (E.lang === 'verilog' && (a.t.kind === 'str' || b.t.kind === 'str')) { a = strVec(E, a); b = strVec(E, b); }
      if (E.lang === 'verilog' && (a.t.kind === 'real') !== (b.t.kind === 'real')) {
        // Verilog: an operand of type real makes the whole ?: real (IEEE 1364-2005 4.8.1)
        const toReal = x => (x.t.kind === 'real' ? x : fold({ k: 'conv', a: x, ext: !!x.t.s, t: REAL }));
        a = toReal(a); b = toReal(b);
      }
      const w = Math.max(a.t.w, b.t.w);
      // (Verilog: signed only when both operands are, even at the same width)
      const sameSign = !!a.t.s === !!b.t.s || E.lang === 'vhdl';
      let t = a.t.kind === b.t.kind && a.t.w === b.t.w && sameSign ? a.t : vecT(w, a.t.s && b.t.s);
      if (a.t.kind === 'array' || a.t.kind === 'str') t = a.t;
      // VHDL `x when c else y`: a condition that is not true selects the else value
      return fold({ k: 'cond', c, a, b, t, vh: E.lang === 'vhdl' });
    }
    case 'attr': return bindAttr(E, e, loc);
    case 'field': return fold(fieldNode(E, bindExpr(E, e.base, null, loc), e.name, loc));
    case 'aggregate': return bindAggregate(E, e, expect, loc);
    case 'qualified': {
      const te = E.sc.lookup(e.type);
      const sn = stdTypeName(e.type);
      let t = te && te.kind === 'type' ? te.t : null;
      // unsigned'(0 => x) / std_logic_vector'(a, b): the aggregate's own length gives the width
      if (!t && sn && e.expr.op === 'aggregate' && e.expr.items.length && e.expr.items.every(i => !i.choices || i.choices.every(c => c && c.op === 'int'))) {
        const n = Math.max(e.expr.items.length, ...e.expr.items.flatMap(i => (i.choices || []).map(c => Number(c.value) + 1)));
        t = vecT(n, !!sn.signed);
      }
      let inner = bindExpr(E, e.expr, t || expect, loc);
      if (sn && sn.kind === 'logic' && inner.k === 'str') inner = strAsLogic(inner, { t: vecT(1) });
      // (std_logic_vector'(…) / bit_vector'(…) carry their type mark: overloads on the type, #72)
      if (sn && inner.t.kind === 'logic') { const { mark: _m, ...it } = inner.t; return fold({ k: 'conv', a: inner, ext: inner.t.s, t: { ...it, s: !!sn.signed, ...(sn.mark ? { mark: sn.mark } : {}) } }); }
      return inner;
    }
  }
  throw new ElabError(`unsupported expression '${e.op}'`, loc);
}

// VHDL record element selection r.f: the element of the record (an array of its fields)
export function fieldNode(E, base, name, loc) {
  // a member of a SystemVerilog packed structure: its bits of the vector
  if (base.t.members) {
    const m = base.t.members.find(x => x.name === name);
    if (!m) throw new ElabError(`structure has no member '${name}'`, loc);
    return { k: 'slice', base, lo: m.lo, t: m.t };
  }
  const F = base.t.fields;
  if (!F) throw new ElabError(`'${name}' selected from an expression that is not a record`, loc);
  const k = F.findIndex(f => f.name === name);
  if (k < 0) throw new ElabError(`record has no field '${name}'`, loc);
  return { k: 'elem', base, index: { k: 'c', val: V.fromInt(k), t: INT }, t: F[k].t };
}

// (hier: a hierarchical name, which may name a generate block elaborated later)
export function notDeclared(name, loc) {
  const err = new ElabError(`'${name}' is not declared`, loc);
  if (name.includes('.')) err.hier = true;
  return err;
}

// the parts of a hierarchical name's text: a.b[2].c -> [{ name: 'a' }, { name: 'b', index: 2 }, { name: 'c' }]
function splitHier(name) {
  return name.split('.').map(p => {
    const m = /^(.*)\[(-?\d+)\]$/.exec(p);
    return m ? { name: m[1], index: { op: 'int', value: m[2] } } : { name: p, index: null };
  });
}

// A hierarchical name inside the module (IEEE 1364-2005 12.5-12.6, 1800-2017 23.6-23.9): the first
// name is found upwards in the enclosing scopes (a generate block, a named block, a generate loop
// indexed by a constant expression, the module itself by the module's name); each next name in the
// scope the name before it names, or a member of the packed structure it selects (s.a, s[1].b).
// Returns { entry } (what the scope declares under the last name: signal, constant, variable,
// function, task) or { node } (a member or element select), or null.
export function hierResolve(E, name, path, loc) {
  const segs = path || splitHier(name);
  if (segs.length < 2) return null;
  let cur = E.sc.lookup(segs[0].name), node = null;
  if (!cur && E.modSc && segs[0].name === E.inst?.module && !segs[0].index) cur = { kind: 'gen', sc: E.modSc };
  if (!cur) return null;
  const toNode = seg => {
    if (!node) node = refNode(E, cur, seg.name);
    if (!node) throw new ElabError(`'${seg.name}' is not a value`, loc);
  };
  const select = seg => {
    if (!seg.index) return true;
    if (!node && cur.kind === 'genarr') {
      const i = V.toNum(constOf(E, bindExpr(E, seg.index, null, loc), loc));
      cur = cur.elems.get(i);
      return !!cur;
    }
    toNode(seg);
    node = fold(indexNode(E, node, seg.index, loc));
    return true;
  };
  if (!select(segs[0])) return null;
  for (let k = 1; k < segs.length; k++) {
    const seg = segs[k];
    if (!node && cur.kind === 'gen') {
      cur = cur.sc.local(seg.name);
      if (!cur) return null;
    } else {
      if (!node && (cur.kind === 'genarr' || cur.kind === 'func')) return null;
      toNode(segs[k - 1]);
      node = fold(fieldNode(E, node, seg.name, loc));
    }
    if (!select(seg)) return null;
  }
  return node ? { node } : { entry: cur };
}

// Verilog hierarchical reference relative to the current instance or from the top: a signal
// (inst.sub.sig) or a variable of a named block of a process (inst.blk.v, a node reading the
// process's frame: #12). Returns a node, or null.
function hierLookup(E, name) {
  const parts = name.split('.');
  const findChild = (i, n) => i.children.find(c => c.name === n);
  const blockVar = (inst, key, nm) => {
    const bv = inst?.blockVars?.get(key);
    return bv ? { k: 'xloc', ref: bv.ref, i: bv.i, t: bv.t, name: nm } : null;
  };
  // a named block of this instance (blk.v from another process)
  const own = blockVar(E.inst, E.prefix + name, name) || blockVar(E.inst, name, name);
  if (own) return own;
  // walk up to find the first component
  let start = E.inst;
  while (start && !findChild(start, parts[0]) && start.name !== parts[0]) start = start.parent;
  if (!start) return null;
  let cur = start.name === parts[0] && !findChild(start, parts[0]) ? start : findChild(start, parts[0]);
  let k = 1;
  for (; k < parts.length - 1 && cur && findChild(cur, parts[k]); k++) cur = findChild(cur, parts[k]);
  if (!cur) return null;
  const rest = parts.slice(k);
  if (rest.length > 1) return blockVar(cur, rest.join('.'), name);
  const sig = cur.signals.find(s => s.name === rest[0]) || cur.ports.find(p => p.name === rest[0])?.sig;
  if (sig) return { k: 'sig', sig, t: sig.t, name };
  // a parameter of the instance (u.P): its value
  const prm = cur.params?.find(p => p.name === rest[0]);
  return prm && prm.value ? { k: 'c', val: prm.value, t: prm.t, name } : null;
}

// an element of a packed array (logic [0:3][7:0], my_t [3:0]): its bits of the vector, the
// first element the most significant when the range is ascending, the last when descending
export function packedElem(base, index) {
  const p = base.t.packed, ew = p.elem.w;
  if (index.k === 'c' && !index.val.x) {
    const off = bitpos(p, V.toNum(index.val));
    if (off >= 0 && off < p.n) return { k: 'slice', base, lo: off * ew, t: p.elem };
  }
  // offset of the element: (i - right) or (right - i), times the element's width
  const cI32 = n => ({ k: 'c', val: V.fromInt(n), t: INT });
  const i = { k: 'conv', a: index, ext: !!index.t.s, t: INT };
  const off = p.desc ? { k: 'bin', o: '-', a: i, b: cI32(p.right), t: INT } : { k: 'bin', o: '-', a: cI32(p.right), b: i, t: INT };
  const start = { k: 'bin', o: '*', a: off, b: cI32(ew), t: INT };
  return { k: 'pslice', base, start, dir: '+', t: p.elem };
}

function indexNode(E, base, idxExpr, loc) {
  const index = bindExpr(E, idxExpr, null, loc);
  if (base.t.packed) return packedElem(base, index);
  // (chk: VHDL, an index outside the range of the array is a run-time error)
  if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...(E.lang === 'vhdl' ? { chk: true } : {}) };
  if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };   // s(i): a CHARACTER
  if (index.k === 'c' && !index.val.x) {
    const p = bitpos(base.t, V.toNum(index.val));
    if (p < 0 || p >= base.t.w) diag(E, `index ${V.toDec(index.val, true)} out of range for '${base.name || 'expression'}'`, loc, 'warning');
  }
  return { k: 'bit', base, index, t: BIT, ...(E.lang === 'vhdl' ? { chk: true } : {}) };
}

export function sliceNode(E, base, leftE, rightE, loc, dir) {
  const left = bindExpr(E, leftE, null, loc), right = bindExpr(E, rightE, null, loc);
  // a slice of a string (s(1 to n), n known at run time too): a string
  if (base.t.kind === 'str') return { k: 'strslice', base, left, right, ...(dir ? { dir } : {}), t: STR };
  if (base.t.kind === 'array') return arraySliceNode(E, base, left, right, loc, dir);
  if (left.k === 'c' && right.k === 'c') {
    // a VHDL null slice (`v(-1 downto 0)`, `v(0 to -1)`): no element
    if (E.lang === 'vhdl' && dir && (dir === 'downto' ? V.toNum(left.val) < V.toNum(right.val) : V.toNum(left.val) > V.toNum(right.val))) {
      return { k: 'slice', base, lo: 0, t: { ...vecT(0, base.t.kind === 'logic' ? base.t.s : false), ...(base.t.mark ? { mark: base.t.mark } : {}) } };
    }
    const p1 = bitpos(base.t, V.toNum(left.val)), p2 = bitpos(base.t, V.toNum(right.val));
    const lo = Math.min(p1, p2), w = Math.abs(p1 - p2) + 1;
    if (lo < 0 || lo + w > base.t.w) diag(E, `slice out of range for '${base.name || 'expression'}'`, loc, 'warning');
    // (Verilog: a part-select is unsigned, even of a signed vector; VHDL: a slice keeps the type)
    return { k: 'slice', base, lo, t: { ...vecT(w, base.t.kind === 'logic' && E.lang === 'vhdl' ? base.t.s : false), ...(base.t.mark ? { mark: base.t.mark } : {}) } };
  }
  // dynamic slice: width from a probe evaluation (loop variables at their initial values)
  // A VHDL slice keeps its direction: against it, it is null (`v(i + N - 1 downto i)` with N = 0,
  // #61): no element, nothing read or written
  const vdir = E.lang === 'vhdl' && dir ? dir : undefined;
  let w;
  try {
    // (probe: loop variables are not at real values yet, so no run-time checks)
    const ctx = probeCtx(E);
    const l = V.toNum(evalE(left, ctx)), r = V.toNum(evalE(right, ctx));
    w = vdir && (vdir === 'downto' ? l < r : l > r) ? 0 : Math.abs(l - r) + 1;
  } catch {
    throw new ElabError('slice bounds must be constant (or depend only on loop variables)', loc);
  }
  return { k: 'dslice', base, left, right, t: vecT(w), ...(vdir ? { dir: vdir } : {}) };
}

// A slice of an array (`mem(0 to 3)` of an array of vectors, #11): the elements of a constant
// range, as an array of the same element type (arrays are stored by ascending index, so the
// slice is the elements from its low bound on); a null range has none
function arraySliceNode(E, base, left, right, loc, dir) {
  const t = base.t;
  const desc = dir ? dir === 'downto' : t.desc;
  // bounds known at run time only (`br(n to size - 1) := (others => x"00")` in a function): the
  // elements are found when it is evaluated; its length here is the probe's (loop variables at their
  // first values), 0 when it cannot be probed
  if (left.k !== 'c' || right.k !== 'c') {
    let len = 0, l0 = t.lo, r0 = t.lo - 1;
    try {
      const ctx = probeCtx(E);
      l0 = V.toNum(evalE(left, ctx)); r0 = V.toNum(evalE(right, ctx));
      len = (E.lang === 'vhdl' && (desc ? l0 < r0 : l0 > r0)) ? 0 : Math.abs(l0 - r0) + 1;
    } catch { /* not probed */ }
    return { k: 'daslice', base, left, right, ...(E.lang === 'vhdl' ? { dir: desc ? 'downto' : 'to' } : {}),
      t: { kind: 'array', left: l0, right: r0, desc, lo: Math.min(l0, r0), len, elem: t.elem, w: t.elem.w, dynamic: true }, loc };
  }
  const l = V.toNum(left.val), r = V.toNum(right.val);
  const isNull = E.lang === 'vhdl' && (desc ? l < r : l > r);
  const lo = Math.min(l, r), len = isNull ? 0 : Math.abs(l - r) + 1, off = lo - t.lo;
  if (len && (off < 0 || off + len > t.len)) diag(E, `slice out of range for '${base.name || 'expression'}'`, loc, 'warning');
  return { k: 'aslice', base, off, t: { kind: 'array', left: l, right: r, desc, lo, len, elem: t.elem, w: t.elem.w }, loc };
}

// A VHDL string literal of std_logic characters (kept as a string inside report / assert
// messages) compared with a vector is a vector literal.
function strAsLogic(n, other) {
  if (n.k !== 'str' || other.t.kind !== 'logic' || !/^[01uxzwlh-]+$/i.test(n.value)) return n;
  const val = V.fromBits(mapBits(n.value));
  return { k: 'c', val, t: vecT(val.w) };
}

// std_logic_signed: std_logic_vector operands of arithmetic and comparisons are signed
function slvNum(E, n) {
  if (E.slvArith !== 'signed' || n.t.kind !== 'logic' || n.t.mark !== 'std_logic_vector' || n.t.s) return n;
  return fold({ k: 'conv', a: n, ext: true, t: { ...n.t, s: true } });
}

// std_logic_arith mixes unsigned and signed operands as signed: the unsigned one is extended
// with a 0 sign bit (numeric_std does not allow the mix, so this never changes its results)
function mixedSign(a, b) {
  if (a.t.kind !== 'logic' || b.t.kind !== 'logic' || !!a.t.s === !!b.t.s) return [a, b];
  const widen = n => fold({ k: 'conv', a: n, ext: false, t: vecT(n.t.w + 1, true) });
  return a.t.s ? [a, widen(b)] : [widen(a), b];
}

function harmonizeVhdl(a, b) {
  // numeric_std: vector op integer -> integer converted to the vector's width
  if (a.t.kind === 'logic' && (b.t.kind === 'int')) b = fold({ k: 'conv', a: b, ext: true, t: vecT(a.t.w, a.t.s) });
  else if (b.t.kind === 'logic' && (a.t.kind === 'int')) a = fold({ k: 'conv', a, ext: true, t: vecT(b.t.w, b.t.s) });
  return [a, b];
}

function bindBinary(E, e, expect, loc) {
  const o = e.o;
  let a, b;
  if (e.a.op === 'aggregate' && e.b.op !== 'aggregate') { b = bindExpr(E, e.b, null, loc); a = bindExpr(E, e.a, b.t, loc); }
  else { a = bindExpr(E, e.a, ARITH.has(o) || BITWISE.has(o) ? expect : null, loc); b = bindExpr(E, e.b, a.t.kind === 'logic' || a.t.kind === 'enum' ? a.t : null, loc); }
  if (E.lang === 'vhdl' && (BITWISE.has(o) || ARITH.has(o))) { a = strAsLogic(a, b); b = strAsLogic(b, a); }
  if (E.lang === 'verilog') { a = strVec(E, a); b = strVec(E, b); }
  if (E.lang === 'vhdl' && (ARITH.has(o) || CMP.has(o))) { a = slvNum(E, a); b = slvNum(E, b); }
  // REAL operands: floating point (time * real, real / real, comparisons...)
  const fp = a.t.kind === 'real' || b.t.kind === 'real';
  if (fp && CMP.has(o)) return { k: 'bin', o, a, b, t: E.lang === 'vhdl' ? BOOL : BIT, fp };
  if (fp && (ARITH.has(o))) return { k: 'bin', o, a, b, t: a.t.kind === 'time' || b.t.kind === 'time' ? TIME : REAL, fp };
  if (CMP.has(o)) {
    if (E.lang === 'vhdl' && a.t.kind === 'enum' && b.k === 'c') b = { ...b, t: a.t };
    if (E.lang === 'vhdl') { a = strAsLogic(a, b); b = strAsLogic(b, a); [a, b] = mixedSign(a, b); }
    // std_logic_1164 '=' on std_logic_vector (no std_logic_unsigned / _signed): arrays of
    // different lengths are never equal (IEEE 1076 §9.2.3)
    if (E.lang === 'vhdl' && !E.slvArith && (o === '==' || o === '!=') && a.t.kind === 'logic' && b.t.kind === 'logic' &&
        (a.t.mark || b.t.mark) && a.t.w !== b.t.w) return { k: 'c', val: V.fromBool(o === '!='), t: BOOL };
    // VHDL '=' / '/=' compare the enumeration values exactly ('X' = 'X' is true, 'U' /= '1' too);
    // the matching ?= / ?/= treat '-' (constant) bits as don't cares
    if (E.lang === 'vhdl') return { k: 'bin', o, a, b, t: BOOL, vh: o === '==' || o === '!=', ...(e.match && a.t.kind === 'logic' ? { match: true } : {}) };
    return { k: 'bin', o, a, b, t: BIT };
  }
  if (o === '&&' || o === '||') return { k: 'bin', o, a, b, t: BIT };
  if (SHIFT.has(o)) {
    const n = { k: 'bin', o, a, b, t: a.t.kind === 'int' ? a.t : { ...vecT(a.t.w, a.t.s), ...(a.t.mark ? { mark: a.t.mark } : {}) } };
    // VHDL sll/srl/sla/sra/rol/ror: a negative count shifts the other way; bit_vector sla / sra
    // replicate the rightmost / leftmost bit (numeric_std's sla / sra are shift_left / shift_right)
    if (E.lang === 'vhdl') { n.vs = true; if (a.t.mark === 'bit_vector') n.fill = true; }
    return n;
  }
  if (E.lang === 'vhdl' && (ARITH.has(o) && o !== '**')) [a, b] = harmonizeVhdl(a, b);
  if (E.lang === 'vhdl' && ARITH.has(o) && o !== '**') [a, b] = mixedSign(a, b);
  const s = a.t.s && b.t.s;
  if (a.t.kind === 'int' && b.t.kind === 'int') {
    // VHDL INTEGER: division by zero and results outside the 32-bit range are run-time errors
    const chk = E.lang !== 'vhdl' ? {} : o === '/' || o === 'mod' || o === 'rem' ? { dz: true } : o === '+' || o === '-' || o === '*' ? { ov: true } : {};
    return { k: 'bin', o, a, b, t: INT, ...chk };
  }
  if (a.t.kind === 'time' && b.t.kind === 'time' && o === '/') return { k: 'bin', o, a, b: { ...b, t: { ...b.t, s: true } }, t: { ...INT, w: 64 } };   // time / time: universal integer
  if (a.t.kind === 'time' || b.t.kind === 'time') return { k: 'bin', o, a, b, t: TIME };
  if (o === '**') return { k: 'bin', o, a, b, t: a.t.kind === 'int' ? INT : vecT(a.t.w, a.t.s) };
  let w = Math.max(a.t.w, b.t.w);
  if (o === '*' && E.lang === 'vhdl') w = a.t.w + b.t.w;
  // (VHDL boolean and / or / nand / nor are short-circuit operators: sc)
  if (BITWISE.has(o) && a.t.kind === 'bool' && b.t.kind === 'bool') return { k: 'bin', o, a, b, t: BOOL, ...(o !== '^' && o !== '~^' ? { sc: true } : {}) };
  const t = BITWISE.has(o) && w === 1 && (a.t.scalar || b.t.scalar) ? BIT : vecT(w, s);
  return { k: 'bin', o, a, b, t };
}

function bindAttr(E, e, loc) {
  const at = e.attr.toLowerCase();
  if (at === 'image' || at === 'to_string') {
    const a = bindExpr(E, e.args[0], null, loc);
    // T'image(x): formatted as a value of T (boolean / enumeration prefixes)
    const pe = e.prefix.op === 'ref' ? E.sc.lookup(e.prefix.name) : null;
    const it = pe && pe.kind === 'type' && pe.t && (pe.t.kind === 'enum' || pe.t.kind === 'bool') ? pe.t
      : e.prefix.op === 'ref' && /^boolean$/i.test(e.prefix.name) ? BOOL : e.prefix.op === 'ref' && /^character$/i.test(e.prefix.name) ? CHAR : null;
    if (it === CHAR && a.k === 'str' && a.value.length === 1) return { k: 'image', a: charConst(a.value), t: STR, it };
    return { k: 'image', a, t: STR, ...(it ? { it } : {}), ...(at === 'to_string' ? { ts: true } : {}) };
  }
  // prefix could be a type name
  let t, node = null;
  if (e.prefix.op === 'ref') {
    const ent = E.sc.lookup(e.prefix.name);
    if (ent && ent.kind === 'type') t = ent.t;
    else if (!ent && stdTypeName(e.prefix.name)) t = elabType(E, stdTypeName(e.prefix.name));
  }
  if (!t) { node = bindExpr(E, e.prefix, null, loc); t = node.t; }
  const cint = n => ({ k: 'c', val: V.fromInt(n, 32, true), t: INT });
  // A'length(N) ... of a multi-dimensional array (an array of arrays): dimension N
  if (e.args.length && t.kind === 'array' && ['length', 'left', 'right', 'high', 'low', 'ascending'].includes(at)) {
    const dim = V.toNum(constOf(E, bindExpr(E, e.args[0], null, loc), loc));
    for (let k = 1; k < dim; k++) { if (t.elem?.kind !== 'array' && t.elem?.kind !== 'logic') throw new ElabError(`'${at}(${dim}): no dimension ${dim}`, loc); t = t.elem; }
  }
  if (t.kind === 'str' && at === 'length' && node) return { k: 'strlen', a: node, t: INT };
  // the bounds of a string (strings index from 1 here): 'low / 'left 1, 'high / 'right its length
  if (t.kind === 'str' && ['left', 'low'].includes(at)) return cint(1);
  if (t.kind === 'str' && ['right', 'high'].includes(at)) return t.slen !== undefined ? cint(t.slen) : node ? { k: 'strlen', a: node, t: INT } : cint(0);
  if (t.kind === 'str' && at === 'ascending') return { k: 'c', val: V.fromBool(true), t: BOOL };
  if (t.kind === 'str' && at === 'length' && t.slen !== undefined) return cint(t.slen);
  if (t.kind === 'str' && at !== 'event') throw new ElabError(`'${at} of a string is not supported (use std_logic_vector)`, loc);
  if ((t.kind === 'int' || t.kind === 'enum' || t.kind === 'bool') && ['left', 'right', 'high', 'low'].includes(at)) {
    // scalar types: bounds of the range; T'low is T'left of an ascending range, T'right of a
    // descending one (a null range too: `range 5 to 3` has 'low 5, 'high 3; IEEE 1076-2008 16.2.2)
    const [l, r] = t.kind === 'int' ? scalarBounds(t) : [0, t.kind === 'bool' ? 1 : t.names.length - 1];
    const down = t.kind === 'int' && !!t.rdown;
    const v = { left: l, right: r, low: down ? r : l, high: down ? l : r }[at];
    return t.kind === 'int' ? cint(v) : { k: 'c', val: V.fromInt(v, t.w, false), t };
  }
  switch (at) {
    case 'event':
      if (!edgeOperand(node)) throw new ElabError("'event requires a signal", loc);
      return { k: 'event', ...edgeOperand(node), t: BOOL };
    case 'length': return cint(t.kind === 'array' ? t.len : t.w);
    case 'ascending': return { k: 'c', val: V.fromBool(t.kind === 'int' ? !t.rdown : t.kind === 'enum' || t.kind === 'bool' ? true : !t.desc), t: BOOL };
    case 'left': return cint(t.left);
    case 'right': return cint(t.right);
    // (by the direction: a null range `3 downto 5` has 'high 3, 'low 5)
    case 'high': return cint(t.desc === undefined ? Math.max(t.left, t.right) : t.desc ? t.left : t.right);
    case 'low': return cint(t.desc === undefined ? Math.min(t.left, t.right) : t.desc ? t.right : t.left);
    case 'pos': return fold({ k: 'conv', a: bindExpr(E, e.args[0], t, loc), ext: false, t: INT });
    case 'val': return fold({ k: 'conv', a: bindExpr(E, e.args[0], null, loc), ext: true, t });
    case 'succ': case 'pred': case 'leftof': case 'rightof': {
      // ('leftof is 'pred, 'rightof is 'succ; the other way round for a descending integer subtype)
      const a = bindExpr(E, e.args[0], null, loc);
      const up = at === 'succ' || (at === 'rightof') !== (t.kind === 'int' && !!t.rdown);
      if (t.kind === 'int') return fold({ k: 'bin', o: up ? '+' : '-', a, b: cint(1), t: INT });
      return fold({ k: 'bin', o: up ? '+' : '-', a, b: { k: 'c', val: V.fromInt(1, a.t.w, false), t: vecT(a.t.w) }, t });
    }
    case 'value': {   // T'value("text") of a constant string
      const a = bindExpr(E, e.args[0], STR, loc);
      const str = a.k === 'str' ? a.value : a.k === 'c' && a.val.str !== undefined ? a.val.str : null;
      if (str === null) throw new ElabError("'value needs a constant string", loc);
      const txt = str.trim().toLowerCase();
      if (t.kind === 'enum') {
        const i = t.names.indexOf(txt);
        if (i < 0) throw new ElabError(`'${str}' is not a value of type '${t.name}'`, loc);
        return { k: 'c', val: V.fromInt(i, t.w, false), t };
      }
      if (t.kind === 'bool' && (txt === 'true' || txt === 'false')) return { k: 'c', val: V.fromBool(txt === 'true'), t: BOOL };
      if (t.kind === 'int' && /^[-+]?\d+$/.test(txt)) return cint(Number(txt));
      throw new ElabError(`'value of '${str}' is not supported`, loc);
    }
    case 'stable':
      if (!edgeOperand(node)) throw new ElabError("'stable requires a signal", loc);
      if (e.args.length) {   // S'stable(T): no event during the last T
        if (node.k !== 'sig') throw new ElabError("'stable(T) requires a whole signal", loc);
        return { k: 'sigattr', a: 'stable', sig: node.sig, T: bindExpr(E, e.args[0], TIME, loc), t: BOOL };
      }
      return { k: 'un', o: '!', a: { k: 'event', ...edgeOperand(node), t: BOOL }, t: BOOL };
    case 'last_value': case 'last_event':
      if (!node || node.k !== 'sig') throw new ElabError(`'${at} requires a whole signal`, loc);
      return { k: 'sigattr', a: at, sig: node.sig, t: at === 'last_event' ? TIME : node.t };
  }
  throw new ElabError(`attribute '${e.attr} is not supported`, loc);
}

function bindAggregate(E, e, expect, loc) {
  if (!expect) {
    // positional aggregate without context: concatenation
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) });
    }
    throw new ElabError('cannot determine the type of the aggregate', loc);
  }
  if (expect.kind === 'str') {
    // a string aggregate ((others => ' '), ('a', 'b'), (1 => 'x', others => '.')) of constant
    // characters: its declared length, or as many characters as it lists (strings index from 1 here)
    const chars = [];
    let pos = 0, other = null;
    const ch = it => String.fromCharCode(V.toNum(constOf(E, bindExpr(E, it.value, CHAR, loc), loc)) & 255);
    for (const it of e.items) {
      if (!it.choices) { chars[pos++] = ch(it); continue; }
      for (const c of it.choices) {
        if (c === 'others') { other = ch(it); continue; }
        if (c.range) { const r = evalRange(E, c.range); if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) chars[i - 1] = ch(it); continue; }
        chars[V.toNum(constOf(E, bindExpr(E, c, null, loc), loc)) - 1] = ch(it);
      }
    }
    const n = expect.slen ?? chars.length;
    let str = '';
    for (let i = 0; i < n; i++) {
      if (chars[i] === undefined && other === null) throw new ElabError(`string aggregate: no value for character ${i + 1}`, loc);
      str += chars[i] ?? other;
    }
    return { k: 'str', value: str, t: expect.slen !== undefined ? expect : STR };
  }
  if (expect.kind === 'array' && expect.fields) {
    // record aggregate: positional and / or named (field => value, others => value)
    const F = expect.fields, slots = new Array(F.length).fill(null);
    let pos = 0;
    for (const it of e.items) {
      if (!it.choices) { if (pos < F.length) { slots[pos] = bindExpr(E, it.value, F[pos].t, loc); pos++; } continue; }
      for (const ch of it.choices) {
        if (ch === 'others') { F.forEach((f, k) => { if (!slots[k]) slots[k] = bindExpr(E, it.value, f.t, loc); }); continue; }
        const k = ch.op === 'ref' ? F.findIndex(f => f.name === ch.name) : -1;
        if (k < 0) throw new ElabError(`record has no field '${ch.name ?? '?'}'`, loc);
        slots[k] = bindExpr(E, it.value, F[k].t, loc);
      }
    }
    const elems = slots.map((x, k) => x || { k: 'c', val: defaultValue(F[k].t, E.lang), t: F[k].t });
    return fold({ k: 'arr', elems, t: expect });
  }
  if (expect.kind === 'array') {
    if (expect.unconstrained) {
      const elems = e.items.map(i => bindExpr(E, i.value, expect.elem, loc));
      const t = { ...expect, unconstrained: false, left: 0, right: elems.length - 1, desc: false, lo: 0, len: elems.length };
      return fold({ k: 'arr', elems, t });
    }
    const slots = new Array(expect.len).fill(null);
    let pos = 0;
    for (const it of e.items) {
      const val = bindExpr(E, it.value, expect.elem, loc);
      if (!it.choices) {
        const idx = expect.desc ? expect.left - pos : expect.left + pos;
        pos++;
        if (idx - expect.lo >= 0 && idx - expect.lo < expect.len) slots[idx - expect.lo] = val;
        continue;
      }
      for (const ch of it.choices) {
        if (ch === 'others') { for (let k = 0; k < slots.length; k++) if (!slots[k]) slots[k] = val; }
        else if (ch.range) {
          const r = evalRange(E, ch.range);
          if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) slots[i - expect.lo] = val;
        } else slots[V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)) - expect.lo] = val;
      }
    }
    const def = { k: 'c', val: defaultValue(expect.elem, E.lang), t: expect.elem };
    return fold({ k: 'arr', elems: slots.map(s => s || def), t: expect });
  }
  // vector aggregate
  const t = expect.unconstrained ? null : expect;
  if (!t) {
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.length) });
    }
    throw new ElabError('aggregate with others needs a constrained target', loc);
  }
  const w = t.w;
  const bits = new Array(w).fill(null); // indexed by bit position
  let pos = 0;
  for (const it of e.items) {
    const val = bindExpr(E, it.value, BIT, loc);
    if (!it.choices) {
      const idx = t.desc ? t.left - pos : t.left + pos;
      pos++;
      bits[bitpos(t, idx)] = val;
      continue;
    }
    for (const ch of it.choices) {
      if (ch === 'others') { for (let k = 0; k < w; k++) if (!bits[k]) bits[k] = val; }
      else if (ch.range) {
        const r = evalRange(E, ch.range);
        if (!r.isNull) for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) bits[bitpos(t, i)] = val;
      } else bits[bitpos(t, V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)))] = val;
    }
  }
  // (a null array: no element; its choices are still bound, for their diagnostics)
  if (w === 0) return { k: 'c', val: V.mk(0, 0n, 0n, !!t.s), t: vecT(0, t.s) };
  const zero = { k: 'c', val: V.ZERO, t: BIT };
  const parts = [];
  for (let p = w - 1; p >= 0; p--) parts.push(bits[p] || zero);
  if (parts.every(p => p === parts[0])) return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(w), t: INT }, a: parts[0], t: vecT(w, t.s) });
  return fold({ k: 'cat', parts, t: { ...vecT(w, t.s) } });
}

// VHDL name(args): index, call, or conversion
function bindApply(E, e, expect, loc) {
  const name = e.name;
  const args = e.args.slice();
  const entry = E.sc.lookup(name);
  if (entry?.kind === 'subalias') return bindApply(E, { ...e, name: entry.target }, expect, loc);
  if (entry && (entry.kind === 'sig' || entry.kind === 'const' || entry.kind === 'loc' || entry.kind === 'alias')) {
    let base = refNode(E, entry, name);
    // m(i, j) of a multi-dimensional array (an array of arrays): one index per dimension
    while (args.length > 1 && base.t.kind === 'array') {
      const a = args.shift();
      base = fold({ k: 'elem', base, index: bindExpr(E, a.named !== undefined ? a.value : a, null, loc), t: base.t.elem });
    }
    if (args.length !== 1) throw new ElabError(`'${name}' indexed with ${args.length} indices`, loc);
    const a = args[0].named !== undefined ? args[0].value : args[0];
    if (a.op === 'slice' && a.base == null) return fold(sliceNode(E, base, a.left, a.right, loc, a.dir));
    return fold(indexNode(E, base, a, loc));
  }
  if (entry && entry.kind === 'func') return bindCall(E, entry, args, name, loc);
  if (entry && entry.kind === 'type') {
    const a = bindExpr(E, positional(args)[0], null, loc);
    const t = entry.t;
    return fold({ k: 'conv', a, ext: a.t.s, t: t.unconstrained ? { ...a.t } : t });
  }
  return bindBuiltin(E, name, args, expect, loc);
}

export function positional(args) { return args.map(a => (a && a.named !== undefined ? a.value : a)); }

// names of the built-in VHDL subprograms (bindBuiltin; finish / stop: std.env procedures)
export const BUILTIN_SUBPROGRAMS = new Set(`rising_edge falling_edge to_unsigned conv_unsigned to_signed conv_signed conv_std_logic_vector
to_integer conv_integer resize ext sxt to_stdlogicvector to_bitvector to_stdulogicvector to_01 to_x01 to_stdulogic to_bit
shift_left shift_right rotate_left rotate_right and_reduce or_reduce xor_reduce nand_reduce nor_reduce xnor_reduce
to_string to_bstring to_hstring minimum maximum now std_match finish stop`.split(/\s+/));

// std.textio (and std_logic_textio / VHDL-2008's hwrite, owrite, bwrite, hread…): writing lines to
// the simulator's console (OUTPUT, and files: their lines are shown with the file's name) and
// reading lines of the project's data files
export const TEXTIO_PROCS = new Set(['write', 'writeline', 'read', 'readline', 'deallocate', 'flush', 'hwrite', 'owrite', 'bwrite', 'hread', 'oread', 'bread']);
const TIME_UNITS = { fs: 0.001, ps: 1, ns: 1e3, us: 1e6, ms: 1e9, sec: 1e12, min: 6e13, hr: 3.6e15 };
function textioFile(E, a, loc) {
  if (a && a.op === 'ref' && /^(output|input)$/i.test(a.name) && !E.sc.lookup(a.name)) return { k: 'c', val: { str: a.name.toLowerCase(), std: true }, t: STR };
  return bindExpr(E, a, null, loc);
}
export function bindTextio(E, name, rawArgs, loc) {
  const pos = [], named = {};
  for (const a of rawArgs) { if (a && a.named !== undefined) named[String(a.named).toLowerCase()] = a.value; else pos.push(a); }
  const need = (a, what) => { if (!a) throw new ElabError(`${name}: missing ${what}`, loc); return a; };
  switch (name) {
    case 'flush': return { k: 'null', loc };
    case 'deallocate': return { k: 'textio', op: name, line: bindLvalue(E, need(pos[0], 'the line'), loc), loc };
    case 'writeline': case 'readline':
      return { k: 'textio', op: name, file: textioFile(E, need(named.f ?? named.file ?? pos[0], 'the file'), loc), line: bindLvalue(E, need(named.l ?? pos[1], 'the line'), loc), loc };
    case 'write': case 'hwrite': case 'owrite': case 'bwrite': {
      const line = bindLvalue(E, need(named.l ?? pos[0], 'the line'), loc);
      const value = bindExpr(E, need(named.value ?? pos[1], 'the value'), null, loc);
      const jArg = named.justified ?? pos[2], fArg = named.field ?? pos[3], xArg = named.unit ?? named.digits ?? pos[4];
      let justified = 'right';
      if (jArg) {
        if (jArg.op !== 'ref' || !/^(left|right)$/i.test(jArg.name)) throw new ElabError(`${name}: justified is right or left`, loc);
        justified = jArg.name.toLowerCase();
      }
      const field = fArg ? bindExpr(E, fArg, INT, loc) : null;
      // (unit => ns: a time unit's name; digits => n)
      const extra = !xArg ? null : xArg.op === 'ref' && TIME_UNITS[xArg.name.toLowerCase()] !== undefined && !E.sc.lookup(xArg.name)
        ? { k: 'c', val: V.fromInt(TIME_UNITS[xArg.name.toLowerCase()] >= 1 ? TIME_UNITS[xArg.name.toLowerCase()] : 0, 64, true), t: TIME }
        : bindExpr(E, xArg, null, loc);
      return { k: 'textio', op: name, line, value, justified, field, extra, loc };
    }
    case 'read': case 'hread': case 'oread': case 'bread': {
      const g = named.good ?? pos[2];
      return { k: 'textio', op: name, line: bindLvalue(E, need(named.l ?? pos[0], 'the line'), loc), target: bindLvalue(E, need(named.value ?? pos[1], 'the variable'), loc), good: g ? bindLvalue(E, g, loc) : null, loc };
    }
  }
  throw new ElabError(`textio procedure '${name}' is not supported`, loc);
}

function bindBuiltin(E, name, rawArgs, expect, loc) {
  const args = positional(rawArgs);
  const A = i => bindExpr(E, args[i], null, loc);
  const C = i => V.toNum(constOf(E, A(i), loc));
  const conv = (a, w, s, ext = a.t.s, kind) => fold({ k: 'conv', a, ext, t: kind === 'int' ? INT : vecT(w, s) });
  switch (name) {
    case 'rising_edge': case 'falling_edge': {
      const a = A(0);
      if (!edgeOperand(a)) throw new ElabError(`${name} requires a signal`, loc);
      return { k: 'edge', ...edgeOperand(a), pos: name === 'rising_edge', t: BOOL };
    }
    case 'to_unsigned': case 'conv_unsigned': return conv(A(0), C(1), false, true);
    case 'to_signed': case 'conv_signed': return conv(A(0), C(1), true, true);
    case 'conv_std_logic_vector': return conv(A(0), C(1), false);
    case 'to_integer': case 'conv_integer': case 'integer': case 'natural': case 'positive': { const a = slvNum(E, A(0)); return conv(a, 32, true, a.t.s, 'int'); }
    case 'real': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: REAL }); }
    // boolean(c): a conversion to the type it already has (NEORV32: boolean(BOOT_MODE_SELECT = 0))
    case 'boolean': { const a = A(0); if (a.t.kind !== 'bool') throw new ElabError(`cannot convert to boolean`, loc); return a; }
    case 'resize': {
      const a = A(0), w = C(1);
      if (a.t.s && a.t.kind === 'logic' && w < a.t.w) return fold({ k: 'conv', a, ext: true, sres: true, t: vecT(w, true) });
      return conv(a, w, a.t.s);
    }
    case 'ext': return conv(A(0), C(1), false, false);
    case 'sxt': return conv(A(0), C(1), true, true);
    case 'unsigned': case 'std_logic_vector': case 'std_ulogic_vector': case 'to_stdlogicvector': case 'to_bitvector': case 'to_stdulogicvector': case 'bit_vector': {
      const a = A(0);
      if (a.t.kind === 'int') throw new ElabError(`cannot convert an integer with ${name}(); use to_unsigned(x, n)`, loc);
      const n = conv(a, a.t.w, false);
      // (std_logic_vector(u) / bit_vector(…) keep their type mark: overloads on the type, #72)
      const mark = name === 'unsigned' ? null : /bit/.test(name) ? 'bit_vector' : 'std_logic_vector';
      return mark ? { ...n, t: { ...n.t, mark } } : n;
    }
    case 'signed': { const a = A(0); return conv(a, a.t.w, true); }
    case 'to_01': case 'to_x01': case 'std_logic': case 'to_stdulogic': case 'to_bit': return A(0);
    case 'shift_left': case 'shift_right': case 'rotate_left': case 'rotate_right': {
      const a = A(0), b = A(1);
      const o = name === 'shift_left' ? '<<' : name === 'shift_right' ? (a.t.s ? '>>>' : '>>') : name === 'rotate_left' ? 'rol' : 'ror';
      return fold({ k: 'bin', o, a, b, t: a.t });
    }
    case 'and_reduce': case 'or_reduce': case 'xor_reduce': case 'nand_reduce': case 'nor_reduce': case 'xnor_reduce': {
      const o = { and_reduce: '&', or_reduce: '|', xor_reduce: '^', nand_reduce: '~&', nor_reduce: '~|', xnor_reduce: '~^' }[name];
      return fold({ k: 'un', o, a: A(0), t: BIT });
    }
    case 'to_string': case 'to_bstring': return { k: 'image', a: A(0), t: STR, ts: true };
    case 'endfile': return { k: 'textio_eof', file: textioFile(E, args[0], loc), t: BOOL };
    case 'to_hstring': return { k: 'image', a: A(0), t: STR, hex: true };
    // ieee.math_real: ceil, floor, round, trunc, sqrt, log2, log10, log (natural, or to a base), exp, sign,
    // realmax, realmin (on reals; folded when constant, as in `constant W : natural := integer(ceil(log2(real(N))));`)
    case 'ceil': case 'floor': case 'round': case 'trunc': case 'sqrt': case 'log2': case 'log10': case 'log': case 'exp': case 'sign': case 'realmax': case 'realmin': {
      const ra = args.map((_, i) => { const a = A(i); return a.t.kind === 'real' ? a : fold({ k: 'conv', a, ext: !!a.t.s, t: REAL }); });
      if (!ra.length || ra.length > 2) throw new ElabError(`'${name}' takes one or two real arguments`, loc);
      return fold({ k: 'rfn', f: name, a: ra[0], b: ra[1], t: REAL });
    }
    case 'minimum': case 'maximum': {
      const a = A(0), b = A(1);
      const c = { k: 'bin', o: name === 'minimum' ? '<' : '>', a, b, t: BOOL };
      return fold({ k: 'cond', c, a, b, t: a.t });
    }
    case 'now': return { k: 'now', t: TIME, unit: 1 };
    // '-' in a constant operand is a don't care ('-' and 'X' share one encoding)
    case 'std_match': { const a = A(0), b = A(1); return fold({ k: 'bin', o: '==', a: strAsLogic(a, b), b: strAsLogic(b, a), t: BOOL, vh: true, match: true }); }
  }
  throw new ElabError(`'${name}' is not declared`, loc);
}

function bindVlogCall(E, e, expect, loc) {
  const name = e.name;
  if (name[0] === '$') {
    const A = i => bindExpr(E, e.args[i], null, loc);
    // the type of an argument that may be a type's name ($bits(my_t))
    const T = i => { const a = e.args[i]; const te = a?.op === 'ref' ? E.sc.lookup(a.name) : null; return te?.kind === 'type' ? te.t : A(i).t; };
    switch (name) {
      case '$signed': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, true) }); }
      case '$unsigned': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, false) }); }
      // SystemVerilog size cast W'(expr): the value at W bits, extended by its own sign, signedness kept
      case '$__size_cast': { const w = Number(e.args[0].value), a = A(1); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(w, a.t.s) }); }
      // a cast to a type T'(expr): signed'(x), unsigned'(x), int'(x), my_t'(x) (IEEE 1800-2017 6.24.1)
      case '$__type_cast': {
        const tn = e.args[0].name, a = strVec(E, A(1));
        if (tn === 'signed' || tn === 'unsigned') return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, tn === 'signed') });
        const te = E.sc.lookup(tn);
        const t = te?.kind === 'type' ? te.t : tn === 'int' || tn === 'integer' ? INT : { byte: vecT(8, true), shortint: vecT(16, true), longint: vecT(64, true), bit: BIT }[tn];
        if (!t || t.kind === 'array' || t.kind === 'real' || t.kind === 'str') throw new ElabError(`cast to '${tn}' is not supported`, loc);
        ctxSize(a, Math.max(a.t.w, t.w));
        return fold({ k: 'conv', a, ext: a.t.s, t });
      }
      case '$clog2': {
        diag(E, '$clog2 is not supported by XST (ISE 14.7); use a constant function instead', loc, 'warning', 'Silinx');   // (Silinx's own message)
        const a = A(0);
        if (isConstNode(a)) {
          const v = V.toBig(constOf(E, a, loc));
          let r = 0; while ((1n << BigInt(r)) < v) r++;
          return { k: 'c', val: V.fromInt(r), t: INT };
        }
        // a non-constant argument (a constant function's own argument, #59): the number of powers of
        // two below the value, sum of (a > 2**i) for i < its width; folds when the call is evaluated
        const w = Math.max(1, a.t.w), ut = vecT(w, false);
        const ua = { k: 'conv', a, ext: !!a.t.s, t: ut };
        let sum = cI(0);
        for (let i = 0; i < w; i++) {
          const p2 = { k: 'c', val: V.fromInt(1n << BigInt(i), w, false), t: ut };
          const gt = { k: 'bin', o: '>', a: ua, b: p2, t: BIT };
          sum = { k: 'bin', o: '+', a: sum, b: { k: 'conv', a: gt, ext: false, t: INT }, t: INT };
        }
        return fold(sum);
      }
      case '$bits': { const t = T(0); return cI(t.kind === 'array' && !t.fields ? t.len * t.elem.w : t.w); }
      // array queries (IEEE 1800-2017 20.7) of dimension d (1: the first unpacked one, or the
      // first packed one of a vector)
      case '$left': case '$right': case '$low': case '$high': case '$size': case '$increment': {
        const dims = dimsOf(T(0));
        const d = e.args[1] ? V.toNum(constOf(E, A(1), loc)) : 1;
        if (d < 1 || d > dims.length) throw new ElabError(`${name}: no dimension ${d}`, loc);
        const { left, right } = dims[d - 1];
        const v = { $left: left, $right: right, $low: Math.min(left, right), $high: Math.max(left, right), $size: Math.abs(left - right) + 1, $increment: left >= right ? 1 : -1 }[name];
        return cI(v);
      }
      case '$dimensions': return cI(dimsOf(T(0)).length);
      // $countbits(e, c…): the number of bits of e equal (===) to one of the control bits (20.9)
      case '$countbits': case '$countones': case '$onehot': case '$onehot0': {
        const a = A(0);
        const ctl = name === '$countbits'
          ? [...new Set(e.args.slice(1).map((_, k) => { const v = constOf(E, A(k + 1), loc); return V.toBin(V.resize(v, Math.max(1, v.w))).slice(-1); }))]
          : ['1'];
        const bitLit = b => ({ k: 'c', val: V.fromBits(b), t: BIT });
        let sum = cI(0);
        for (let i = 0; i < a.t.w; i++) {
          const bit = { k: 'slice', base: a, lo: i, t: BIT };
          const hit = ctl.map(c => ({ k: 'bin', o: '===', a: bit, b: bitLit(c), t: BIT })).reduce((x, y) => ({ k: 'bin', o: '|', a: x, b: y, t: BIT }));
          sum = { k: 'bin', o: '+', a: sum, b: { k: 'conv', a: hit, ext: false, t: INT }, t: INT };
        }
        if (name === '$onehot') return fold({ k: 'bin', o: '==', a: sum, b: cI(1), t: BIT });
        if (name === '$onehot0') return fold({ k: 'bin', o: '<=', a: sum, b: cI(1), t: BIT });
        return fold(sum);
      }
      // $isunknown(e): a bit of e is x or z (the reduction xor of e is x)
      case '$isunknown': { const a = A(0); return fold({ k: 'bin', o: '===', a: { k: 'un', o: '^', a, t: BIT }, b: { k: 'c', val: V.X1, t: BIT }, t: BIT }); }
      // real math functions of constant arguments (20.8)
      case '$floor': case '$ceil': case '$sqrt': case '$ln': case '$log10': case '$exp': case '$pow': case '$sin': case '$cos': case '$tan': case '$asin': case '$acos': case '$atan': case '$atan2': case '$hypot': case '$sinh': case '$cosh': case '$tanh': {
        // (an argument known at run time only: evaluated by the simulator)
        const ns = e.args.map((_, k) => A(k));
        if (!ns.every(isConstNode)) {
          const ra = ns.map(a => (a.t.kind === 'real' ? a : fold({ k: 'conv', a, ext: !!a.t.s, t: REAL })));
          return fold({ k: 'rfn', f: name, a: ra[0], b: ra[1], t: REAL });
        }
        const r = ns.map(n => { const v = constOf(E, n, loc); return n.t.kind === 'real' ? V.toReal(v) : Number(V.toDec(v, !!n.t.s)); });
        const f = { $floor: Math.floor, $ceil: Math.ceil, $sqrt: Math.sqrt, $ln: Math.log, $log10: Math.log10, $exp: Math.exp, $pow: Math.pow, $sin: Math.sin, $cos: Math.cos, $tan: Math.tan, $asin: Math.asin, $acos: Math.acos, $atan: Math.atan, $atan2: Math.atan2, $hypot: Math.hypot, $sinh: Math.sinh, $cosh: Math.cosh, $tanh: Math.tanh }[name];
        return { k: 'c', val: V.real(f(...r)), t: REAL };
      }
      case '$time': case '$stime': return { k: 'sys', name, args: [], t: vecT(64) };
      case '$realtime': return { k: 'sys', name, args: [], t: REAL };
      case '$fopen': return { k: 'sys', name, args: [], t: vecT(32) };   // (file output goes to the log)
      case '$sformatf': return { k: 'sys', name, args: e.args.map((_, i) => { const a = A(i); ctxSize(a, a.t.w); return a; }), t: STR };
      case '$random': return { k: 'sys', name, args: e.args.length ? [bindLvalue(E, e.args[0], loc)] : [], t: INT };
      case '$urandom': return { k: 'sys', name, args: [], t: vecT(32) };
      case '$urandom_range': return { k: 'sys', name, args: e.args.map((_, i) => A(i)), t: vecT(32) };
      case '$rtoi': { const a = A(0); return fold({ k: 'conv', a, ext: true, rtoi: true, t: INT }); }   // truncates
      case '$itor': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: REAL }); }
      case '$realtobits': case '$bitstoreal': return A(0);
    }
    throw new ElabError(`system function ${name} is not supported`, loc);
  }
  let entry = E.sc.lookup(name);
  // a recursive call: inside the function its name is the return variable; find the function
  for (let sc = E.sc; entry && entry.kind !== 'func' && sc; sc = sc.parent) { const x = sc.local(name); if (x && x.kind === 'func') entry = x; }
  if (!entry && (e.path || name.includes('.'))) entry = hierResolve(E, name, e.path, loc)?.entry || null;   // top.f(x), blk.f(x)
  if (!entry || entry.kind !== 'func') throw new ElabError(`function '${name}' is not declared`, loc);
  return bindCall(E, entry, e.args, name, loc);
}

// VHDL overloaded subprogram: the alternative whose parameter types fit the actuals (first
// exactly - signedness, type marks -, then by kind of type); the last declared one otherwise.
export function pickOverload(E, entry, rawArgs, loc) {
  if (!entry.alts) return entry;
  let acts;
  try {
    acts = rawArgs.map(a => (a == null ? null : { named: a.named, n: bindExpr(E, a.named !== undefined ? a.value : a, null, loc) }));
  } catch (e) {
    if (e instanceof ElabError || e instanceof SimError) return entry;
    throw e;
  }
  const fitsType = (n, pt, strict) => {
    const at = n.t;
    if (n.k === 'str' && pt.kind === 'logic') return !pt.scalar && /^[01uxzwlh-]+$/i.test(n.value);
    if (pt.kind !== at.kind) return false;
    switch (pt.kind) {
      case 'logic':
        if (pt.scalar ? !(at.w === 1 && at.scalar) : at.scalar) return false;
        return !strict || pt.scalar || (!!at.s === !!pt.s && (at.mark || '') === (pt.mark || ''));
      case 'enum': return at.name === pt.name;
      case 'array': return !strict || !pt.name || at.name === pt.name;
      default: return true;
    }
  };
  // a character literal ('q') is a character, not a one-character string (it binds as either)
  const charLit = k => { const r = rawArgs[k]; const x = r && r.named !== undefined ? r.value : r; return !!(x && ((x.op === 'str' && x.char) || (x.op === 'lit' && x.scalar && x.ch))); };
  const fits = (alt, strict) => {
    const ps = alt.decl.params, used = new Set();
    if (acts.length > ps.length) return false;
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k];
      if (!a) continue;
      const i = a.named !== undefined ? ps.findIndex(p => p.name === a.named) : k;
      if (i < 0) return false;
      used.add(i);
      let pt;
      try { pt = elabType(alt.E, ps[i].type, true); } catch { return false; }
      if (charLit(k)) { if (pt.char) continue; if (pt.kind === 'str' && strict) return false; }
      if (!fitsType(a.n, pt, strict)) return false;
    }
    return ps.every((p, i) => used.has(i) || p.default);
  };
  return entry.alts.find(a => fits(a, true)) || entry.alts.find(a => fits(a, false)) || entry;
}

function bindCall(E, entry, rawArgs, name, loc) {
  entry = pickOverload(E, entry, rawArgs, loc);
  const decl = entry.decl;
  if (decl.kind === 'task') throw new ElabError(`'${name}' is a procedure/task, not a function`, loc);
  if (rawArgs.filter(a => !(a && a.named !== undefined)).length > decl.params.length) throw new ElabError(`too many arguments in call to '${name}'`, loc);
  // named association
  let argExprs = new Array(decl.params.length).fill(null);
  rawArgs.forEach((a, k) => {
    if (a && a.named !== undefined) {
      const idx = decl.params.findIndex(p => p.name === a.named);
      if (idx < 0) throw new ElabError(`'${name}' has no parameter '${a.named}'`, loc);
      argExprs[idx] = a.value;
    } else argExprs[k] = a;
  });
  argExprs = argExprs.map((a, k) => a || decl.params[k].default || null);   // VHDL default parameter values
  const args = argExprs.map((a, k) => {
    if (!a) throw new ElabError(`missing argument '${decl.params[k].name}' in call to '${name}'`, loc);
    let at = null;   // an aggregate actual takes the type of its parameter
    if (a.op === 'aggregate') { try { at = elabType(entry.E, decl.params[k].type, true); } catch { at = null; } }
    const n = strVec(E, bindExpr(E, a, at && !at.unconstrained ? at : null, loc));
    // a std_logic string literal (kept as a string in report messages) for a vector parameter
    const pt = decl.params[k].type;
    if (E.lang === 'vhdl' && n.k === 'str' && pt && (pt.kind === 'logic' || (pt.kind === 'named' && stdTypeName(pt.name)?.kind === 'logic'))) return strAsLogic(n, { t: { kind: 'logic' } });
    return n;
  });
  const fn = boundFunction(entry, args, loc);
  if (decl.kind === 'task' || !fn.retT) throw new ElabError(`'${name}' is a procedure/task, not a function`, loc);
  args.forEach((a, k) => { if (E.lang === 'verilog') ctxSize(a, fn.params[k].t.w); });
  // a function's output / inout arguments (SystemVerilog f(k, o) in an expression): the actuals
  // are assigned when it returns
  const outs = decl.params.map((p, k) => (p.dir === 'out' || p.dir === 'inout') && argExprs[k] && isLvalueExpr(argExprs[k]) ? bindLvalue(E, argExprs[k], loc) : null);
  if (outs.some(Boolean)) return { k: 'call', fn, args, t: fn.retT, outTargets: outs, loc };
  return fold({ k: 'call', fn, args, t: fn.retT });
}

// Bound function / procedure for these argument types (cached per argument types).
// VHDL: when the generic binding fails (e.g. a width depends on an integer parameter:
// `variable r : std_logic_vector(n-1 downto 0)`, `to_unsigned(i, w)`), the subprogram is bound
// again with its constant integer arguments known as constants (cached per argument value).
// The cache key of an argument's type: its kind, width and sign, and for a vector or an array its
// index range and direction (an unconstrained parameter takes them: 'range, 'left, indexing)
const argTypeKey = t => `${t.kind}${t.w}${t.s ? 's' : ''}`
  + (t.kind === 'array' ? `[${t.left}:${t.right}${t.desc ? 'd' : ''}x${t.len}]{${t.elem ? argTypeKey(t.elem) : ''}}`
    : t.kind === 'logic' && t.left !== undefined ? `[${t.left}:${t.right}${t.desc ? 'd' : ''}]` : '');

export function boundFunction(entry, args, loc, sigActuals = null) {
  const decl = entry.decl;
  const key = args.map(a => argTypeKey(a.t)).join(',');
  const consts = new Map();
  if (entry.E.lang === 'vhdl') {
    decl.params.forEach((p, k) => {
      const a = args[k];
      if (!sigActuals?.[k] && a && a.k === 'c' && a.t.kind === 'int' && p.dir !== 'out' && p.dir !== 'inout' && String(p.class || '').toLowerCase() !== 'variable') consts.set(k, a.val);
    });
  }
  if (!sigActuals && entry.cache.has(key)) {
    const fn = entry.cache.get(key);
    if (!fn.needsConsts) return fn;
  } else if (consts.size) {
    // try the generic binding; on errors, fall back to the per-constant one
    const diags = entry.E.ctx.design.diags, n0 = diags.length;
    let fn = null;
    try { fn = bindSubprogram(entry, args, key, sigActuals, null); } catch (e) { if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e; }
    if (fn && !diags.slice(n0).some(d => d.severity === 'error')) return fn;
    diags.length = n0;
    if (!sigActuals) entry.cache.set(key, { needsConsts: true });
  } else {
    return bindSubprogram(entry, args, key, sigActuals, null);
  }
  if (!consts.size) return entry.cache.get(key);
  const ckey = key + '|' + [...consts].map(([k, v]) => `${k}=${V.toDec(v, true)}`).join(',');
  if (!sigActuals && entry.cache.has(ckey)) return entry.cache.get(ckey);
  return bindSubprogram(entry, args, ckey, sigActuals, consts);
}

function bindSubprogram(entry, args, key, sigActuals, consts) {
  const decl = entry.decl;
  const DE = entry.E;
  const fb = new FrameBuilder(DE.outerFb);
  const sc = new Scope(DE.sc);
  // inTask: a Verilog task or a VHDL procedure, which may assign the signals it sees (a function should not)
  const FE = { ...DE, sc, fb, inProcess: true, inFunction: true, inTask: decl.kind === 'task' || !decl.returnType };
  const fn = { name: decl.name, params: [], body: null, retSlot: null, retT: null, impure: false, level: fb.level, loc: decl.loc };
  // a Verilog task or function that is not automatic: its variables are static (the simulator keeps
  // them from one call to the next; one set per declaration, so per instance of its module)
  if (DE.lang === 'verilog' && !decl.automatic) fn.static = entry.static ??= Symbol(decl.name);
  if (!sigActuals) entry.cache.set(key, fn);
  try {
    decl.params.forEach((p, k) => {
      if (sigActuals?.[k]) {
        const a = sigActuals[k];
        sc.def(p.name, { kind: 'alias', rv: a.rv, lv: a.lv, t: a.rv.t });
        fn.params.push({ alias: true, dir: p.dir, name: p.name });
        return;
      }
      let t = elabType(FE, p.type, true);
      if ((t.unconstrained || (t.kind === 'logic' && t.w === 1 && p.type.kind === 'logic' && !p.type.range && args[k] && args[k].t.w > 1 && DE.lang === 'vhdl')) && args[k]) {
        t = { ...args[k].t };
        delete t.unconstrained;
      }
      const i = fb.alloc(t, defaultValue(t, DE.lang));
      if (consts?.has(k)) sc.def(p.name, { kind: 'const', val: fitVal(consts.get(k), t), t });
      else sc.def(p.name, { kind: 'loc', i, t, lvl: fb.level });
      fn.params.push({ i, t, dir: p.dir, name: p.name });
    });
    let retOpen = false;
    if (decl.returnType) {
      let rt = elabType(FE, decl.returnType, true);
      if (rt.unconstrained) {
        // provisional (recursive calls): refined from the return statements below
        retOpen = rt.kind === 'logic';
        rt = args[0] ? { ...args[0].t } : vecT(1);
        delete rt.unconstrained;
        if (decl.returnType.signed !== undefined && rt.kind === 'logic') rt.s = !!decl.returnType.signed;
      }
      fn.retT = rt;
      if (!retOpen) FE.retT = rt;   // (aggregates in return statements)
      if (decl.retVar) {
        fn.retSlot = fb.alloc(rt, defaultValue(rt, DE.lang));
        sc.def(decl.retVar, { kind: 'loc', i: fn.retSlot, t: rt, lvl: fb.level });
      }
    }
    for (const d of decl.decls) bindDecl(FE, d);
    fn.body = bindBlock(FE, decl.body, decl.loc);
    if (retOpen) {
      // unconstrained return type (VHDL): the width of the returned values, when they agree
      const ws = new Set();
      walk(fn.body, x => { if (x.k === 'ret' && x.value && x.value.t) ws.add(x.value.t.kind === 'logic' ? x.value.t.w : -1); });
      if (ws.size === 1 && !ws.has(-1)) fn.retT = vecT([...ws][0], !!fn.retT.s);
    }
  } catch (e) {
    if (!sigActuals && entry.cache.get(key) === fn) entry.cache.delete(key);
    throw e;
  }
  fn.frameInit = fb.makeInit();
  const rw = collectRW(fn.body);
  // outer: the lowest level of an enclosing frame whose variables it (or a subprogram it calls) uses
  walk(fn.body, x => {
    const up = x.k === 'loc' ? x.up : (x.k === 'call' || x.k === 'task') && x.fn?.outer < fn.level ? x.fn.outer : null;
    if (up != null && !(fn.outer <= up)) fn.outer = up;
  });
  fn.impure = rw.reads.size > 0 || rw.writes.size > 0 || fn.outer != null || containsKind(fn.body, ['delay', 'event', 'wait', 'sys', 'fork', 'waitfork']);
  return fn;
}
