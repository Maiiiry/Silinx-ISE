// Silinx - the analysis of an HDL module for the recovery of its ASM chart (#405: out of asm-from-hdl.js): the
// header written by core/asm.js (the chart's original spelling), the clocked process, and the module's state
// register, states, outputs and logic bodies. Isomorphic ES module: no DOM and no Node APIs.
//
//   parseHeader(src, lang)        -> what the generator's header says, or null
//   analyzeModule(mod, src, lang) -> the state machine of a parsed module (throws, in user terms, when it is not one)
import { generate } from './asm.js';
import { lineOf, atLine, fail, stmtList, walkStmts, walkExpr, stripConv, bitsValue, lit, evalInt, vhdlCaseMap, verilogLiteralTable } from './asm-hdl-util.js';
import { readable } from './asm-from-hdl.js';

// ---------------------------------------------------------------------------------------
// Header written by core/asm.js (used to recover the original spelling of the chart)
// ---------------------------------------------------------------------------------------

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') depth--;
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}
function unwrapParens(s) {
  if (!s.startsWith('(') || !s.endsWith(')')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0 && i < s.length - 1) return s; }
  }
  return s.slice(1, -1);
}

/** Parse the comment header of a generated file. Returns null if the file has none. */
export function parseHeader(src, lang) {
  const c = lang === 'vhdl' ? '--' : '//';
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.startsWith(c)) break;
    lines.push(raw.slice(c.length));
  }
  if (!lines.some((l) => /^\s*Generator\s*:\s*Silinx ASM editor/.test(l))) return null;
  const h = { name: null, description: null, encoding: null, states: new Map(), always: new Map(), regInit: new Map() };
  const blk = (name) => {
    if (!h.always.has(name)) h.always.set(name, { actions: [], conds: [], mealy: [] });
    return h.always.get(name);
  };
  const addConds = (s, cond) => {
    if (cond.trim() === 'always') return;
    for (let piece of splitTopLevel(cond, ' && ')) {
      piece = piece.trim();
      if (piece.startsWith('!') && (/^![A-Za-z_]/.test(piece) || piece.startsWith('!('))) piece = piece.slice(1);
      piece = unwrapParens(piece).trim();
      if (piece && !s.conds.includes(piece)) s.conds.push(piece);
    }
  };
  const st = (name) => {
    if (!h.states.has(name)) h.states.set(name, { moore: null, conds: [], mealy: [] });
    return h.states.get(name);
  };
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = /^ (?:Entity|Module)\s*: (\S+)/.exec(l))) { h.name = m[1]; continue; }
    if (/^ Description :/.test(l)) {
      if (lines[i + 1] && /^ {15}\S/.test(lines[i + 1])) h.description = lines[i + 1].trim();
      continue;
    }
    if ((m = /^ Encoding\s*: (\w+)/.exec(l))) { h.encoding = m[1]; continue; }
    if (/^ States:/.test(l)) { section = 'states'; continue; }
    if (/^ Transitions/.test(l)) { section = 'trans'; continue; }
    if (/^ Every cycle/.test(l)) { section = 'every'; continue; }
    if (/^ Registers \(internal/.test(l)) { section = 'regs'; continue; }
    if (!/^ {3}\S/.test(l)) { if (!/^ {3}/.test(l)) section = null; continue; }
    if (section === 'states') {
      m = /^ {3}(\S+)(.*)$/.exec(l);
      const mo = /  Moore: (.*)$/.exec(m[2]);
      st(m[1]).moore = mo ? mo[1].split(', ').map((s) => s.trim()).filter(Boolean) : [];
    } else if (section === 'trans') {
      m = /^ {3}(\S+)\s+: (.*)$/.exec(l);
      if (!m) continue;
      let rest = m[2];
      const s = st(m[1]);
      const mealy = /  \[(.*)\]$/.exec(rest);
      if (mealy) { s.mealy.push(...mealy[1].split(', ').map((x) => x.trim()).filter(Boolean)); rest = rest.slice(0, mealy.index); }
      const arrow = rest.lastIndexOf(' -> ');
      addConds(s, arrow >= 0 ? rest.slice(0, arrow) : rest);
    } else if (section === 'regs') {
      if ((m = /^ {3}(\S+)\s*: \d+ bits?, reset (.+)$/.exec(l))) h.regInit.set(m[1], m[2].trim());
    } else if (section === 'every') {
      if ((m = /^ {3}(\S+)\s+Actions: (.*)$/.exec(l))) { blk(m[1]).actions = m[2].split(', ').map((x) => x.trim()).filter(Boolean); continue; }
      m = /^ {3}(\S+)\s+: (.*)$/.exec(l);
      if (!m) continue;
      let rest = m[2];
      const b = blk(m[1]);
      const acts = /  \[(.*)\]$/.exec(rest);
      if (acts) { b.mealy.push(...acts[1].split(', ').map((x) => x.trim()).filter(Boolean)); rest = rest.slice(0, acts.index); }
      addConds(b, rest);
    }
  }
  return h;
}

/** Comment lines `-- every cycle: <name>` written by the generator before each every-cycle block. */
function everyCycleMarks(src, lang) {
  const re = lang === 'vhdl' ? /^\s*--\s*every cycle:\s*(\S+)\s*$/ : /^\s*\/\/\s*every cycle:\s*(\S+)\s*$/;
  const out = [];
  src.split(/\r?\n/).forEach((l, i) => { const m = re.exec(l); if (m) out.push({ line: i + 1, name: m[1] }); });
  return out;
}

// ---------------------------------------------------------------------------------------
// Clocked process recognition
// ---------------------------------------------------------------------------------------

function hasClockEdge(stmts) {
  let found = false;
  walkStmts(stmts, (st) => {
    for (const e of [st.cond, st.until]) walkExpr(e, (x) => {
      if (x.op === 'apply' && /^(rising|falling)_edge$/.test(x.name)) found = true;
      if (x.op === 'attr' && x.attr === 'event') found = true;
    });
    if (st.kind === 'wait') found = true;
  });
  return found;
}

/** VHDL rising_edge(clk) / clk'event and clk = '1'. Returns the clock name or null. */
function vhdlClockEdge(e) {
  if (e.op === 'apply' && e.name === 'rising_edge' && e.args.length === 1 && e.args[0].op === 'ref') return e.args[0].name;
  if (e.op === 'apply' && e.name === 'falling_edge') fail('falling-edge clocks are not supported: the chart uses the rising edge');
  if (e.op === 'binary' && e.o === '&') {
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
      if (x.op === 'attr' && x.attr === 'event' && x.prefix.op === 'ref' && y.op === 'binary' && y.o === '==' &&
          y.a.op === 'ref' && y.a.name === x.prefix.name && y.b.op === 'lit' && y.b.bits === '1') return x.prefix.name;
    }
  }
  return null;
}

/** Reset condition: returns { name, active } or null. */
function resetCond(e, lang) {
  if (!e) return null;
  const lv = (x) => (x.op === 'lit' && /^[01]$/.test(x.bits) ? x.bits : x.op === 'int' && /^[01]$/.test(x.value) ? x.value : null);
  if (e.op === 'binary' && e.o === '==' && e.a.op === 'ref' && lv(e.b) != null) return { name: e.a.name, active: lv(e.b) === '1' ? 'high' : 'low' };
  if (lang === 'verilog') {
    if (e.op === 'ref') return { name: e.name, active: 'high' };
    if (e.op === 'unary' && (e.o === '!' || e.o === '~') && e.a.op === 'ref') return { name: e.a.name, active: 'low' };
  }
  return null;
}

/** Recognise a clocked process. Returns null for combinational processes. */
function clockedShape(proc, lang) {
  const body = stmtList(proc.body);
  const where = `clocked process${atLine(proc.loc)}`;
  const shapeHelp = lang === 'vhdl'
    ? "expected 'if <reset> then ... elsif rising_edge(<clk>) then ... end if' or 'if rising_edge(<clk>) then if <reset> then ... else ... end if; end if'"
    : "expected 'always @(posedge <clk> [or posedge/negedge <reset>]) if (<reset>) ... else ...'";
  if (lang === 'vhdl') {
    if (!hasClockEdge(body)) return null;
    if (body.length === 1 && body[0].kind === 'if') {
      const top = body[0];
      const r = resetCond(top.cond, lang);
      const els = stmtList(top.else);
      if (r && els.length === 1 && els[0].kind === 'if' && !stmtList(els[0].else).length) {
        const clk = vhdlClockEdge(els[0].cond);
        if (clk) return { clock: clk, reset: { ...r, sync: false }, resetStmts: stmtList(top.then), load: stmtList(els[0].then), proc };
      }
      const clk = vhdlClockEdge(top.cond);
      if (clk && !els.length) {
        const inner = stmtList(top.then);
        const ri = inner.length === 1 && inner[0].kind === 'if' ? resetCond(inner[0].cond, lang) : null;
        if (ri) return { clock: clk, reset: { ...ri, sync: true }, resetStmts: stmtList(inner[0].then), load: stmtList(inner[0].else), proc };
        return { clock: clk, noReset: true, load: inner, proc };
      }
    }
    fail(`${where} has an unsupported structure (${shapeHelp})`);
  }
  if (!Array.isArray(proc.sens) || !proc.sens.some((s) => s.edge !== 'any')) return null;
  const edges = proc.sens;
  if (edges.some((s) => s.edge === 'any' || s.expr.op !== 'ref')) fail(`${where} mixes edge and level events`);
  if (body.length === 1 && body[0].kind === 'if') {
    const r = resetCond(body[0].cond, lang);
    if (r) {
      const clockEv = edges.filter((s) => s.expr.name !== r.name);
      const rstEv = edges.find((s) => s.expr.name === r.name);
      if (clockEv.length !== 1) fail(`${where}: expected one clock edge in the event list`);
      if (clockEv[0].edge !== 'pos') fail('falling-edge clocks are not supported: the chart uses the rising edge');
      if (rstEv && (rstEv.edge === 'pos') !== (r.active === 'high')) fail(`${where}: the reset edge does not match the reset polarity`);
      return { clock: clockEv[0].expr.name, reset: { ...r, sync: !rstEv }, resetStmts: stmtList(body[0].then), load: stmtList(body[0].else), proc };
    }
  }
  if (edges.length === 1 && edges[0].edge === 'pos') return { clock: edges[0].expr.name, noReset: true, load: body, proc };
  fail(`${where} has an unsupported structure (${shapeHelp})`);
}

// ---------------------------------------------------------------------------------------
// Module analysis: find the state register, its states, the outputs and the logic bodies
// ---------------------------------------------------------------------------------------

export function analyzeModule(mod, src, lang) {
  const warnings = [];
  const cmap = lang === 'vhdl' ? vhdlCaseMap(src) : null;
  const orig = (n) => (cmap ? cmap.get(n) || n : n);
  const litBase = lang === 'verilog' ? verilogLiteralTable(src) : () => 'b';

  // ---- constants (VHDL constants, Verilog parameters/localparams) ----------------------
  const consts = new Map(); // name -> { value: BigInt, width, typeName, order, loc }
  let order = 0;
  const addConst = (name, type, value, loc) => {
    let width = null;
    if (value?.op === 'lit') width = value.bits.length;
    if (type?.kind === 'logic') width = type.range ? null : 1;
    const v = evalInt(value, consts);
    consts.set(name, { value: v, width, typeName: type?.kind === 'named' ? type.name : null, order: order++, loc, expr: value });
  };
  for (const p of mod.params || []) {
    if (!p.local && p.default == null) fail(`generic/parameter '${orig(p.name)}' has no value: parameterised modules are not supported`);
    addConst(p.name, p.type, p.default, p.loc || mod.loc);
  }
  const types = new Map();
  const signals = new Map(); // name -> decl
  for (const d of mod.decls || []) {
    if (d.kind === 'const') addConst(d.name, d.type, d.value, d.loc);
    else if (d.kind === 'type') types.set(d.name, d.type);
    else if (d.kind === 'signal') signals.set(d.name, d);
    else if (d.kind === 'function' || d.kind === 'task') fail(`${d.kind} '${orig(d.name)}'${atLine(d.loc)} is not part of the state machine`);
  }
  const widthOfType = (t, what, loc) => {
    if (t?.kind === 'named' && types.get(t.name)?.kind === 'logic') t = types.get(t.name);
    if (t?.kind !== 'logic') return null;
    if (t.signed) fail(`${what}${atLine(loc)} is signed: signed values are not supported`);
    if (!t.range) return 1;
    if (t.range.of) fail(`${what}${atLine(loc)}: 'range attributes are not supported`);
    const l = evalInt(t.range.left, consts), r = evalInt(t.range.right, consts);
    if (l == null || r == null) fail(`${what}${atLine(loc)}: cannot evaluate its width`);
    return Number(l > r ? l - r : r - l) + 1;
  };

  // ---- ports ---------------------------------------------------------------------------
  const ports = new Map();
  for (const p of mod.ports) {
    if (p.dir === 'inout') fail(`port '${orig(p.name)}'${atLine(p.loc)} is bidirectional (inout): not supported in a state machine chart`);
    const width = widthOfType(p.type, `port '${orig(p.name)}'`, p.loc);
    if (width == null) fail(`port '${orig(p.name)}'${atLine(p.loc)} must be ${lang === 'vhdl' ? 'std_logic or std_logic_vector' : 'a wire/reg (vector)'}`);
    ports.set(p.name, { name: p.name, dir: p.dir, width, loc: p.loc });
  }

  // ---- items ---------------------------------------------------------------------------
  const clocked = [], comb = [], concs = [], noReset = [];
  for (const it of mod.items) {
    if (it.kind === 'process') {
      if (it.initial) fail(`initial block${atLine(it.loc)} is not part of the state machine`);
      if (it.decls && it.decls.length) fail(`process${atLine(it.loc)} declares variables, which a state machine chart cannot express`);
      const ck = clockedShape(it, lang);
      if (ck && ck.noReset) noReset.push(ck);
      else if (ck) clocked.push(ck);
      else if (it.sens === 'all' || (Array.isArray(it.sens) && it.sens.length)) comb.push(it);
      else fail(`process${atLine(it.loc)} is not part of the state machine (it has no sensitivity list)`);
    } else if (it.kind === 'assign') {
      if (it.delay) fail(`assignment${atLine(it.loc)} has a delay, which a state machine chart cannot express`);
      concs.push(it);
    } else if (it.kind === 'instance') {
      fail(`instance '${it.name || it.module}' of '${orig(it.module)}'${atLine(it.loc)} is not part of the state machine`);
    } else if (it.kind === 'generate_for' || it.kind === 'generate_if') {
      fail(`generate statement${atLine(it.loc)} is not part of the state machine`);
    } else {
      fail(`${it.kind}${atLine(it.loc)} is not part of the state machine`);
    }
  }
  const noResetError = (c) => fail(`clocked process${atLine(c.proc.loc)} has no reset: the state register must be reset to the initial state`);
  if (!clocked.length && noReset.length) noResetError(noReset[0]);
  if (!clocked.length) fail('no clocked process found: the module has no state register, so it is not a state machine');
  const clock = clocked[0].clock, reset = clocked[0].reset;
  for (const c of clocked) {
    if (c.clock !== clock || c.reset.name !== reset.name || c.reset.active !== reset.active || c.reset.sync !== reset.sync) {
      fail(`clocked process${atLine(c.proc.loc)} uses a different clock or reset than the process${atLine(clocked[0].proc.loc)}`);
    }
  }
  for (const n of [clock, reset.name]) {
    const p = ports.get(n);
    if (!p || p.dir !== 'in' || p.width !== 1) fail(`'${orig(n)}' must be a 1-bit input port (it is used as ${n === clock ? 'clock' : 'reset'})`);
  }

  // ---- drivers -------------------------------------------------------------------------
  const drivers = new Map(); // name -> { where: 'clocked'|'comb'|'conc', loc }
  const addDriver = (target, where, loc) => {
    if (target.op !== 'ref') fail(`assignment${atLine(loc)} writes part of a signal (bit/slice/concatenation): not supported in a state machine chart`);
    const prev = drivers.get(target.name);
    if (prev && prev.unit !== where.unit) fail(`'${orig(target.name)}' is assigned in more than one process (lines ${lineOf(prev.loc)} and ${lineOf(loc)})`);
    if (!prev) drivers.set(target.name, { ...where, loc });
  };
  for (const c of clocked) {
    walkStmts(c.load, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'clocked', unit: c }, st.loc || c.proc.loc); });
    walkStmts(c.resetStmts, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'clocked', unit: c }, st.loc || c.proc.loc); });
  }
  for (const p of comb) walkStmts(p.body, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'comb', unit: p }, st.loc || p.loc); });
  for (const a of concs) addDriver(a.target, { kind: 'conc', unit: a }, a.loc);
  for (const [name, d] of drivers) {
    const p = ports.get(name);
    if (p && p.dir === 'in') fail(`input '${orig(name)}' is assigned${atLine(d.loc)}`);
  }

  // ---- state register ------------------------------------------------------------------
  const regs = [...drivers].filter(([, d]) => d.kind === 'clocked').map(([n]) => n);
  const resetVals = new Map();
  for (const c of clocked) {
    for (const st of c.resetStmts) {
      if (st.kind !== 'assign' || st.target.op !== 'ref') fail(`reset branch${atLine(st.loc || c.proc.loc)} may only assign reset values to registers`);
      resetVals.set(st.target.name, st);
    }
  }
  const selectorCount = new Map();
  const bump = (n, k = 1) => selectorCount.set(n, (selectorCount.get(n) || 0) + k);
  const allBodies = [...clocked.map((c) => c.load), ...comb.map((p) => p.body)];
  for (const b of allBodies) {
    walkStmts(b, (st) => {
      if (st.kind === 'case' && st.expr.op === 'ref') bump(st.expr.name, 2);
      for (const e of [st.cond, st.value]) walkExpr(e, (x) => {
        if (x.op === 'binary' && (x.o === '==' || x.o === '!=')) {
          if (x.a.op === 'ref' && x.b.op === 'ref' && (consts.has(x.b.name) || isEnumLit(x.b.name))) bump(x.a.name);
        }
      });
    });
  }
  for (const a of concs) walkExpr(a.value, (x) => {
    if (x.op === 'binary' && (x.o === '==' || x.o === '!=') && x.a.op === 'ref' && x.b.op === 'ref' && (consts.has(x.b.name) || isEnumLit(x.b.name))) bump(x.a.name);
  });
  function isEnumLit(n) { for (const t of types.values()) if (t.kind === 'enum' && t.values.includes(n)) return true; return false; }
  let cands = regs.filter((r) => selectorCount.has(r));
  if (cands.length > 1) {
    const named = cands.filter((r) => { const v = resetVals.get(r)?.value; return v && v.op === 'ref' && (consts.has(v.name) || isEnumLit(v.name)); });
    if (named.length) cands = named;
  }
  if (cands.length > 1) {
    const best = Math.max(...cands.map((r) => selectorCount.get(r)));
    const top = cands.filter((r) => selectorCount.get(r) === best);
    if (top.length > 1) fail(`more than one state register found (${top.map(orig).join(', ')}): only one state machine per module is supported`);
    cands = top;
  }
  if (!cands.length) fail('state signal not found: no clocked process loads a register that is used in a case statement or compared with state constants');
  const S = cands[0];
  for (const c of noReset) {
    const targets = new Set();
    walkStmts(c.load, (st) => { if (st.kind === 'assign' && st.target.op === 'ref') targets.add(st.target.name); });
    if (targets.has(S)) noResetError(c);
    fail(`process${atLine(c.proc.loc)} is not part of the state machine (it drives ${[...targets].map((t) => `'${orig(t)}'`).join(', ') || 'nothing'})`);
  }
  const sDecl = signals.get(S);
  const sPort = ports.get(S);
  if (sPort) fail(`the state register '${orig(S)}' is a port: the state must be an internal signal`);
  if (!sDecl) fail(`state signal '${orig(S)}' is not declared`);
  const sReset = resetVals.get(S);
  if (!sReset) fail(`the state register '${orig(S)}' is not assigned in the reset branch: there is no initial state`);

  // ---- next-state signal ---------------------------------------------------------------
  let N = null;
  for (const c of clocked) {
    for (const st of c.load) {
      if (st.kind === 'assign' && st.target.op === 'ref' && st.target.name === S && st.value.op === 'ref' &&
          !consts.has(st.value.name) && !isEnumLit(st.value.name)) N = st.value.name;
    }
  }
  if (N && drivers.get(N)?.kind !== 'comb' && drivers.get(N)?.kind !== 'conc') {
    fail(`next-state signal '${orig(N)}' must be assigned in a combinational process`);
  }

  // ---- states --------------------------------------------------------------------------
  let states; // [{ key, name, code, index }]
  let enumType = false;
  let sWidth = null;
  const sType = sDecl.type;
  if (sType.kind === 'named' && types.get(sType.name)?.kind === 'enum') {
    enumType = true;
    states = types.get(sType.name).values.map((v, i) => ({ key: v, name: orig(v).replace(/^S_/i, '') || orig(v), code: BigInt(i) }));
  } else {
    sWidth = widthOfType(sType, `state signal '${orig(S)}'`, sDecl.loc);
    if (sWidth == null) fail(`state signal '${orig(S)}' must be an enumeration or a bit vector`);
    // constants related to the state: of the state subtype, or used with the state register
    const related = new Set();
    if (sType.kind === 'named') for (const [n, c] of consts) if (c.typeName === sType.name) related.add(n);
    const refOf = (e) => (e && e.op === 'ref' && consts.has(e.name) ? e.name : null);
    const visit = (st) => {
      if (st.kind === 'case' && st.expr.op === 'ref' && st.expr.name === S) for (const it of st.items) for (const ch of it.choices) { const r = refOf(ch); if (r) related.add(r); }
      if (st.kind === 'assign' && st.target.op === 'ref' && (st.target.name === S || st.target.name === N)) {
        walkExpr(st.value, (x) => { const r = refOf(x); if (r) related.add(r); });
      }
      for (const e of [st.cond, st.value]) walkExpr(e, (x) => {
        if (x.op === 'binary' && (x.o === '==' || x.o === '!=') && x.a.op === 'ref' && x.a.name === S) { const r = refOf(x.b); if (r) related.add(r); }
      });
    };
    for (const b of allBodies) walkStmts(b, visit);
    for (const c of clocked) walkStmts(c.resetStmts, visit);
    for (const a of concs) visit({ kind: 'assign', target: a.target, value: a.value });
    if (!related.size) fail(`the states of '${orig(S)}' must be named constants (${lang === 'vhdl' ? 'constant S_X : state_t := ...' : 'localparam S_X = ...'}) or an enumeration type`);
    states = [...related].sort((a, b) => consts.get(a).order - consts.get(b).order).map((n) => {
      const c = consts.get(n);
      if (c.value == null) fail(`state constant '${orig(n)}'${atLine(c.loc)} has no constant value`);
      return { key: n, name: orig(n).replace(/^S_/i, '') || orig(n), code: c.value };
    });
    const codes = new Set();
    for (const s of states) {
      if (codes.has(s.code)) fail(`state constants share the code ${s.code}: each state needs a distinct code`);
      codes.add(s.code);
    }
  }
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const stateOfExpr = (e) => {
    if (e.op === 'ref' && stateByKey.has(e.name)) return stateByKey.get(e.name);
    if (!enumType && (e.op === 'lit' || e.op === 'int')) {
      const v = e.op === 'lit' ? bitsValue(e.bits, 'state code') : BigInt(e.value);
      return states.find((s) => s.code === v) || null;
    }
    return null;
  };
  const initial = stateOfExpr(sReset.value);
  if (!initial) fail(`the reset value of '${orig(S)}'${atLine(sReset.loc)} is not one of its states`);

  // ---- generics: integer VHDL generics / Verilog parameters that are not state codes -----
  const generics = [];
  const genericSet = new Set();
  for (const p of mod.params || []) {
    if (p.local || stateByKey.has(p.name)) continue;
    const integer = lang === 'vhdl' ? p.type?.kind === 'integer' : (p.type == null || p.type.kind === 'integer');
    const v = consts.get(p.name)?.value;
    if (!integer || v == null || v < 0n || v > 2147483647n) continue;
    generics.push({ name: p.name, default: Number(v) });
    genericSet.add(p.name);
  }

  // ---- input synchronisers: `m <= in; s <= m;` (2 flip-flops, reset to 0) ----------------
  const refCount = new Map();
  const countRefs = (e) => walkExpr(e, (x) => { if (x.op === 'ref') refCount.set(x.name, (refCount.get(x.name) || 0) + 1); });
  const countStmts = (list) => walkStmts(list, (st) => {
    for (const e of [st.cond, st.value, st.expr]) countRefs(e);
    if (st.kind === 'case') for (const it of st.items) for (const ch of it.choices) if (ch && ch.op) countRefs(ch);
  });
  for (const c of clocked) countStmts(c.load);
  for (const p of comb) countStmts(p.body);
  for (const a of concs) countRefs(a.value);
  const loadOf = new Map(); // register -> value of its unconditional load
  for (const c of clocked) for (const st of c.load) if (st.kind === 'assign' && st.target.op === 'ref') loadOf.set(st.target.name, stripConv(st.value));
  const zeroReset = (r) => { const rv = resetVals.get(r); return !!rv && constValue(rv.value, 1) === 0n; };
  const syncOf = new Map(); // input -> { meta, sync }
  const syncRegs = new Map(); // register -> { kind: 'syncmeta'|'syncout', input }
  for (const [M, v] of loadOf) {
    if (v.op !== 'ref' || ports.get(v.name)?.dir !== 'in' || v.name === clock || v.name === reset.name) continue;
    const P = v.name;
    if (ports.has(M) || syncOf.has(P) || refCount.get(P) !== 1 || refCount.get(M) !== 1 || drivers.get(M)?.kind !== 'clocked') continue;
    const Y = [...loadOf].find(([, x]) => x.op === 'ref' && x.name === M)?.[0];
    if (!Y || ports.has(Y) || !zeroReset(M) || !zeroReset(Y)) continue;
    const w = ports.get(P).width;
    if ([M, Y].some((r) => !signals.has(r) || widthOfType(signals.get(r).type, `signal '${orig(r)}'`, signals.get(r).loc) !== w)) continue;
    syncOf.set(P, { meta: M, sync: Y });
    syncRegs.set(M, { kind: 'syncmeta', input: P });
    syncRegs.set(Y, { kind: 'syncout', input: P });
  }

  // ---- registers and outputs -----------------------------------------------------------
  const roles = new Map();    // name -> { kind, out? }
  roles.set(S, { kind: 'state' });
  if (N) roles.set(N, { kind: 'next' });
  for (const [r, info] of syncRegs) roles.set(r, info);
  const outputs = [];         // ordered like the ports
  const outInfo = new Map();  // output/register name -> { registered, internal?, default(BigInt|null), width, reg, next }
  const registers = [];       // internal registers (in declaration order)
  const consumed = new Set(); // concurrent assignments used as register -> output links
  const nextOfReg = new Map();
  for (const c of clocked) {
    for (const st of c.load) {
      const v = st.kind === 'assign' ? stripConv(st.value) : null;
      if (v && st.target.op === 'ref' && st.target.name !== S && v.op === 'ref') {
        const d = drivers.get(v.name);
        if (d && (d.kind === 'comb' || d.kind === 'conc') && !ports.has(v.name)) nextOfReg.set(st.target.name, v.name);
      }
    }
  }
  for (const R of regs) {
    if (R === S || syncRegs.has(R)) continue;
    let O = null;
    if (ports.get(R)?.dir === 'out') O = R;
    else {
      for (const a of concs) {
        const v = stripConv(a.value);
        if (a.target.op === 'ref' && ports.get(a.target.name)?.dir === 'out' && v.op === 'ref' && v.name === R) { O = a.target.name; consumed.add(a); }
      }
    }
    let width, internal = false;
    if (O) {
      if (outInfo.has(O)) fail(`output '${orig(O)}' is driven by more than one register`);
      width = ports.get(O).width;
    } else {
      // internal register (data path): readable in conditions, assigned like a registered output
      const decl = signals.get(R);
      if (!decl) fail(`register '${orig(R)}'${atLine(drivers.get(R).loc)} is not declared`);
      width = widthOfType(decl.type, `register '${orig(R)}'`, decl.loc);
      if (width == null) fail(`register '${orig(R)}'${atLine(decl.loc)} must be ${lang === 'vhdl' ? 'a std_logic, std_logic_vector or unsigned' : 'a reg (vector)'} to be a register of the chart`);
      O = R;
      internal = true;
    }
    const rv = resetVals.get(R);
    let def = 0n;
    if (!rv) warnings.push(`register '${orig(R)}' has no reset value; the chart resets it to 0`);
    else {
      def = constValue(rv.value, width);
      if (def == null) fail(`the reset value of '${orig(R)}'${atLine(rv.loc)} must be a constant`);
    }
    const nx = nextOfReg.get(R) || null;
    outInfo.set(O, { registered: true, internal, default: def, width, reg: R, next: nx });
    if (internal) registers.push(R);
    roles.set(R, { kind: 'regcur', out: O });
    if (O !== R) roles.set(O, { kind: 'regport', out: O });
    if (nx) roles.set(nx, { kind: 'reg', out: O });
  }
  registers.sort((a, b) => [...signals.keys()].indexOf(a) - [...signals.keys()].indexOf(b));
  for (const [name, p] of ports) {
    if (p.dir !== 'out' || outInfo.has(name)) continue;
    const d = drivers.get(name);
    if (!d) fail(`output '${orig(name)}' is never assigned`);
    outInfo.set(name, { registered: false, default: null, width: p.width });
    roles.set(name, { kind: 'out', out: name });
  }
  for (const p of mod.ports) if (outInfo.has(p.name)) outputs.push(p.name);
  for (const [name] of ports) if (ports.get(name).dir === 'in' && name !== clock && name !== reset.name) roles.set(name, { kind: 'in' });
  for (const [name, d] of drivers) {
    if (!roles.has(name)) fail(`signal '${orig(name)}'${atLine(d.loc)} is not part of the state machine (it is neither the state, the next state, a register nor an output)`);
  }
  for (const [name, d] of signals) if (!roles.has(name)) warnings.push(`signal '${orig(name)}'${atLine(d.loc)} is not used by the state machine`);
  for (const c of clocked) {
    for (const [name] of resetVals) {
      const r = roles.get(name);
      if (!r || !['state', 'regcur', 'syncmeta', 'syncout'].includes(r.kind)) fail(`'${orig(name)}' is reset in the clocked process but is not a register of the state machine`);
    }
  }

  function constValue(e, width) {
    if (!e) return null;
    if (e.op === 'lit') return bitsValue(e.bits, 'reset value');
    if (e.op === 'int') return BigInt(e.value);
    if (e.op === 'ref' && consts.has(e.name)) return consts.get(e.name).value;
    if (e.op === 'aggregate' && e.items.length === 1 && e.items[0].choices?.[0] === 'others' && e.items[0].value.op === 'lit') {
      return e.items[0].value.bits === '1' ? (1n << BigInt(width)) - 1n : 0n;
    }
    if (e.op === 'apply' && (e.name === 'std_logic_vector' || e.name === 'unsigned') && e.args.length === 1) return constValue(e.args[0], width);
    if (e.op === 'apply' && e.name === 'to_unsigned' && e.args.length === 2) return evalInt(e.args[0], consts);
    if (e.op === 'qualified') return constValue(e.expr, width);
    return null;
  }

  // ---- logic bodies --------------------------------------------------------------------
  const bodies = []; // { stmts, ctx: 'comb'|'clocked', loc }
  const alwaysGroups = []; // every-cycle blocks: { name, stmts, ctx }
  const marks = everyCycleMarks(src, lang);
  const stateFree = (st) => {
    let ok = true;
    const noS = (e) => walkExpr(e, (x) => { if (x.op === 'ref' && x.name === S) ok = false; });
    walkStmts([st], (x) => {
      if (!['assign', 'if', 'case', 'null'].includes(x.kind)) ok = false;
      if (x.kind === 'assign' && (x.target.op !== 'ref' || x.target.name === S || x.target.name === N)) ok = false;
      for (const e of [x.cond, x.value, x.expr]) noS(e);
      if (x.kind === 'case') for (const it of x.items) for (const ch of it.choices) if (ch && ch.op) noS(ch);
    });
    return ok;
  };
  const addGroups = (stmts, ctx, procLine, nextLine) => {
    const mine = marks.filter((mk) => mk.line > procLine && mk.line < nextLine);
    let cur = null;
    for (const st of stmts) {
      const line = lineOf(st.loc) || 0;
      const mk = [...mine].reverse().find((x) => x.line < line);
      const name = mk ? mk.name : null;
      if (!cur || (mk && cur.mark !== mk)) {
        cur = { name, mark: mk || null, stmts: [], ctx, line: mk ? mk.line : line };
        alwaysGroups.push(cur);
      }
      cur.stmts.push(st);
    }
    // marks without statements: empty blocks
    for (const mk of mine) if (!alwaysGroups.some((g) => g.mark === mk)) alwaysGroups.push({ name: mk.name, mark: mk, stmts: [], ctx, line: mk.line });
  };
  const units = [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0));
  const nextUnitLine = (it) => { const k = units.indexOf(it); return k >= 0 && k + 1 < units.length ? (lineOf(units[k + 1].loc) || Infinity) : Infinity; };
  for (const it of [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0))) {
    if (it.kind === 'assign') {
      if (consumed.has(it)) continue;
      bodies.push({ stmts: [{ kind: 'assign', target: it.target, value: it.value, loc: it.loc }], ctx: 'comb', loc: it.loc });
      continue;
    }
    const ck = clocked.find((c) => c.proc === it);
    if (ck) {
      const rest = ck.load.filter((st) => !(st.kind === 'assign' && st.target.op === 'ref' &&
        ((st.target.name === S && N && st.value.op === 'ref' && st.value.name === N) ||
         (syncRegs.has(st.target.name) && stripConv(st.value).op === 'ref') ||
         (nextOfReg.has(st.target.name) && stripConv(st.value).op === 'ref' && stripConv(st.value).name === nextOfReg.get(st.target.name)))));
      // a clocked process that does not involve the state at all: an every-cycle block
      if (rest.length && rest.every(stateFree) && !ck.resetStmts.some((st) => st.target?.name === S)) {
        addGroups(rest, 'clocked', lineOf(it.loc) || 0, nextUnitLine(it));
        continue;
      }
      bodies.push({ stmts: rest, ctx: 'clocked', loc: it.loc });
      continue;
    }
    // combinational process: leading default assignments (up to the first every-cycle block)
    const list = stmtList(it.body);
    const procLine = lineOf(it.loc) || 0;
    const firstMark = marks.find((mk) => mk.line > procLine && mk.line < nextUnitLine(it))?.line ?? Infinity;
    const defaulted = new Set();
    let i = 0;
    for (; i < list.length; i++) {
      const st = list[i];
      if (st.kind !== 'assign' || st.target.op !== 'ref') break;
      if ((lineOf(st.loc) || 0) > firstMark || defaulted.has(st.target.name)) break;
      defaulted.add(st.target.name);
      const r = roles.get(st.target.name);
      if (r?.kind === 'next' && st.value.op === 'ref' && st.value.name === S) continue;
      if (r?.kind === 'reg' && stripConv(st.value).op === 'ref' && stripConv(st.value).name === outInfo.get(r.out).reg) continue;
      if (r?.kind === 'out') {
        const v = constValue(st.value, outInfo.get(r.out).width);
        if (v != null) { outInfo.get(r.out).default = v; continue; }
      }
      break;
    }
    // statements that do not depend on the state, before the state logic: every-cycle blocks
    // (the state logic after them takes priority, as in the chart)
    let j = i;
    while (j < list.length && stateFree(list[j])) j++;
    if (j > i || firstMark < Infinity) addGroups(list.slice(i, j), 'comb', procLine, nextUnitLine(it));
    bodies.push({ stmts: list.slice(j), ctx: 'comb', loc: it.loc });
  }
  alwaysGroups.sort((a, b) => a.line - b.line);
  // names of the blocks (the generator's comments, else every_cycle, every_cycle2, ...)
  const usedNames = new Set(alwaysGroups.filter((g) => g.name).map((g) => g.name.toLowerCase()));
  let anon = 0;
  for (const g of alwaysGroups) {
    if (g.name) continue;
    let nm;
    do { anon++; nm = anon === 1 ? 'every_cycle' : `every_cycle${anon}`; } while (usedNames.has(nm));
    usedNames.add(nm);
    g.name = nm;
  }

  const widthOf = (name) => {
    const p = ports.get(name);
    return p ? p.width : outInfo.get(name)?.width ?? 1;
  };
  /** Bit numbering of a port/signal: true if it is `(N downto 0)` / `[N:0]` (or a single bit). */
  const zeroBased = (name) => {
    let t = mod.ports.find((p) => p.name === name)?.type ?? signals.get(name)?.type;
    if (t?.kind === 'named' && types.get(t.name)?.kind === 'logic') t = types.get(t.name);
    if (t?.kind !== 'logic' || !t.range) return true;
    const l = evalInt(t.range.left, consts), r = evalInt(t.range.right, consts);
    return l != null && r === 0n && l >= r;
  };
  return {
    warnings, orig, litBase, consts, ports, S, N, states, stateByKey, stateOfExpr, initial, enumType, sWidth, zeroBased,
    clock, reset, roles, outputs, outInfo, bodies, widthOf, alwaysGroups, registers, generics, genericSet, syncOf,
    inputs: mod.ports.filter((p) => roles.get(p.name)?.kind === 'in').map((p) => p.name),
  };
}
