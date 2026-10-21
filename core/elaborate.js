// Elaboration: builds the instance hierarchy from parsed units, evaluates parameters/generics,
// unrolls generate blocks, resolves names and binds IR expressions/statements into executable
// nodes (see interp.js). Works for Verilog, VHDL and mixed designs.
//
// Bound expression nodes:  { k, t, ... }
//   c(val) sig(sig) loc(i) bit(base,index) elem(base,index) slice(base,lo) dslice(base,left,right)
//   pslice(base,start,dir) un(o,a) bin(o,a,b) cond(c,a,b) cat(parts) repl(count,a) conv(a,ext)
//   call(fn,args) sys(name,args) edge(sig,pos) event(sig) str(value) image(a) strcat(parts) arr(elems) now
// Bound statements: blk asg if case for forrange while repeat forever exit next ret null delay event wait task sys report assert
import * as V from './values.js';
import { evalE, runSync, exec, SimError, strToVal, bitpos } from './interp.js';
import { nativePrimitive } from './native.js';
import { purityErrors } from './vhdl/purity.js';
import { declaredNames, interfaceNames, labelErrors } from './vhdl/labels.js';
import {
  BUILTIN_SUBPROGRAMS, TEXTIO_PROCS, bindExpr, bindTextio, boundFunction, defSubAlias, fieldNode, hierResolve,
  notDeclared, packedElem, pickOverload, positional, sliceNode,
} from './elab-expr.js';
// (bindExpr, exported by elaborate.js before #405, still exported from here)
export { bindExpr };

export const INT = { kind: 'int', w: 32, s: true, left: 31, right: 0, desc: true };
export const BOOL = { kind: 'bool', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const BIT = { kind: 'logic', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const TIME = { kind: 'time', w: 64, s: true, left: 63, right: 0, desc: true };
export const REAL = { kind: 'real', w: 64, s: true, left: 63, right: 0, desc: true };
export const STR = { kind: 'str', w: 0, s: false };
// VHDL CHARACTER: an enumeration of the 256 ISO 8859-1 characters (values: the character codes)
export const CHAR = { kind: 'enum', name: 'character', char: true, names: Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)), w: 8, s: false, left: 7, right: 0, desc: true };
export const charConst = ch => ({ k: 'c', val: V.fromInt(ch.charCodeAt(0) & 255, 8, false), t: CHAR });
// a character literal of a user enumeration type (type abc is ('A', 'B', 'C'))
export function enumChar(t, ch) {
  const i = t.names.indexOf(`'${ch}'`);
  return i < 0 ? null : { k: 'c', val: V.fromInt(i, t.w, false), t };
}
export const vecT = (w, s = false) => ({ kind: 'logic', w, s, left: w - 1, right: 0, desc: true });

export const PHYS = { fs: 0.001, ps: 1, ns: 1e3, us: 1e6, ms: 1e9, sec: 1e12, s: 1e12 };

export class ElabError extends Error {
  constructor(msg, loc) { super(msg); this.loc = loc; }
}

// VHDL subprograms of one name from several regions (a package's own and one a use clause makes
// visible: light8080's hstr(unsigned) and txt_util's hstr(std_logic_vector)) are overloads of each
// other; the inner ones come first, so one of the same signature hides the outer one
const vhdlFunc = e => e?.kind === 'func' && e.E?.lang === 'vhdl';
function mergeFuncs(a, b) {
  const alts = [...new Set([...(a.alts || [a]), ...(b.alts || [b])])];
  return alts.length === (a.alts || [a]).length ? a : { ...a, alts };
}

export class Scope {
  constructor(parent = null) { this.map = new Map(); this.parent = parent; }
  def(name, entry) { this.map.set(name, entry); return entry; }
  get(name) { return this.map.get(name); }
  lookup(name) {
    let found = null;
    for (let s = this; s; s = s.parent) {
      const e = s.get(name);
      if (!e) continue;
      if (!found) { if (!vhdlFunc(e)) return e; found = e; continue; }
      if (!vhdlFunc(e)) break;
      found = mergeFuncs(found, e);
    }
    return found;
  }
  local(name) { return this.get(name) || null; }
}

// SystemVerilog: the scope of the packages a module (or package) imports and of every package's
// scoped names (p::name), looked up in the package scopes when used (packages that import each
// other are complete by then; a copy made while one was being elaborated would miss its names)
class ImportScope extends Scope {
  constructor(parent, imports, scoped) { super(parent); this.imports = imports; this.scoped = scoped; }
  get(name) {
    const own = this.map.get(name);
    if (own) return own;
    const i = name.indexOf('::');
    if (i > 0) return this.scoped.get(name.slice(0, i))?.map.get(name.slice(i + 2));
    for (const ps of this.imports) { const e = ps.map.get(name); if (e) return e; }
    return undefined;
  }
}

// The slots of a process's or a subprogram's variables. A subprogram declared in a process or in
// another subprogram reads and writes the variables of the enclosing ones in their frames (#182):
// level is the depth of the frame (a process's, or a subprogram's declared outside processes: 0),
// parent the enclosing one.
export class FrameBuilder {
  constructor(parent = null) { this.inits = []; this.types = []; this.parent = parent; this.level = parent ? parent.level + 1 : 0; }
  alloc(t, init) { this.inits.push(init); this.types.push(t); return this.inits.length - 1; }
  makeInit() {
    const inits = this.inits;
    return () => inits.map(v => (Array.isArray(v) ? v.slice() : v));
  }
  probe() { return this.inits.map(v => (Array.isArray(v) ? v.slice() : v)); }
}

// A context to evaluate an expression at elaboration: the variables (loop variables, those of the
// enclosing frames) at their initial values, no run-time checks
export function probeCtx(E) {
  const outer = [];
  for (let f = E.fb?.parent; f; f = f.parent) outer.unshift(f.probe());
  return { frame: E.fb ? E.fb.probe() : [], outer, sim: null, depth: 0, probe: true };
}

// A variable: a slot of its frame; one of an enclosing process or subprogram (a procedure declared
// in a process using the process's variables, #182) names that frame's level (up)
export const locNode = (E, entry, name) => ({ k: 'loc', i: entry.i, t: entry.t, name, ...(E.fb && entry.lvl != null && entry.lvl !== E.fb.level ? { up: entry.lvl } : {}) });

// ---------------------------------------------------------------- library
export function buildLibrary(parsedFiles) {
  const lib = { modules: new Map(), packages: new Map(), errors: [], files: new Map() };
  const archs = [];
  for (const pf of parsedFiles) {
    lib.errors.push(...(pf.errors || []));
    for (const u of pf.units) {
      if (u.kind === 'module') {
        if (lib.modules.has(u.name) && !lib.modules.get(u.name).entityOnly)
          lib.errors.push({ file: u.file, line: u.loc?.line || 1, col: 1, severity: 'warning', message: `module '${u.name}' redefined (previous in ${lib.modules.get(u.name).file})` });
        lib.modules.set(u.name, u);
      } else if (u.kind === 'package') lib.packages.set(u.name, u);
      else if (u.kind === 'architecture') archs.push(u);
    }
  }
  // pure functions (#185) using what another file declares: a package's signals and impure
  // functions, the ports of an entity (each file's parse reported what it declares itself; this
  // one, with all the files, replaces it: the first thing a function uses may be of another file)
  const at = e => `${e.file}:${e.line}:${e.check}`;
  for (const pf of parsedFiles) {
    if (pf.lang !== 'vhdl' || (pf.errors || []).some(e => e.severity === 'error')) continue;
    for (const e of purityErrors(pf.units, { file: pf.file, text: pf.text, packages: n => lib.packages.get(n), entityOf: a => findModule(lib, a.entity) })) {
      const k = lib.errors.findIndex(x => at(x) === at(e));
      if (k >= 0) lib.errors[k] = e; else lib.errors.push(e);
    }
  }
  for (const a of archs) {
    const ent = findModule(lib, a.entity);
    if (!ent) { lib.errors.push({ file: a.file, line: a.loc?.line || 1, col: 1, severity: 'error', message: `architecture '${a.name}' of unknown entity '${a.entity}'` }); continue; }
    // the labels of an architecture of an entity of another file: not the names of its ports,
    // generics, declarations (#192; those of the architecture itself were checked by the parser)
    if (a.labels) {
      const names = [...interfaceNames(ent), ...(ent.entityOnly ? declaredNames(ent.decls) : [])].map(n => ({ ...n, file: ent.file }));
      lib.errors.push(...labelErrors(a.labels, names, a.file, { labels: false }));
    }
    ent.decls = [...(ent.decls || []), ...a.decls];
    ent.items = a.items;
    ent.uses = [...new Set([...(ent.uses || []), ...(a.uses || [])])];
    ent.archFile = a.file;
    if (a.slvArith) ent.slvArith = a.slvArith;
    delete ent.entityOnly;
  }
  return lib;
}

export function findModule(lib, name) {
  if (lib.modules.has(name)) return lib.modules.get(name);
  const ln = name.toLowerCase();
  for (const [k, m] of lib.modules) if (k.toLowerCase() === ln) return m;
  return null;
}

// Modules that are never instantiated by another module (top-level candidates).
export function topCandidates(lib) {
  const used = new Set();
  const visit = items => {
    for (const it of items || []) {
      if (it.kind === 'instance') used.add(it.module.toLowerCase());
      if (it.items) visit(it.items);
      if (it.then) visit(it.then);
      if (it.else) visit(it.else);
    }
  };
  for (const m of lib.modules.values()) visit(m.items);
  return [...lib.modules.values()].filter(m => !used.has(m.name.toLowerCase())).map(m => m.name);
}

// ---------------------------------------------------------------- elaboration entry
export function elaborate(lib, topName, opts = {}) {
  const design = {
    top: null, signals: [], procs: [], diags: [], lib,
    maxDepth: opts.maxDepth || 64,
  };
  const top = findModule(lib, topName);
  if (!top) {
    design.diags.push({ file: '', line: 1, col: 1, severity: 'error', message: `top module '${topName}' not found` });
    return design;
  }
  const ctx = { design, lib, pkgScopes: new Map() };
  try {
    // opts.generics: { NAME: integer } overrides the top module's generics / parameters
    const ov = new Map(Object.entries(opts.generics || {}).flatMap(([k, v]) => { const e = { val: V.fromInt(v, 32, true), t: INT }; return [[k, e], [k.toLowerCase(), e]]; }));
    design.top = elabInstance(ctx, top, top.name, top.name, ov, new Map(), null, 0);
  } catch (e) {
    if (!(e instanceof ElabError)) throw e;
    design.diags.push({ file: top.file, line: e.loc?.line || 1, col: e.loc?.col || 1, severity: 'error', message: e.message });
  }
  return design;
}

export function diag(E, msg, loc, sev = 'error', tool) {
  // (an expression without a location, as a call in a declaration's range: the declaration's, #16)
  if (!loc?.line) loc = E.at || loc;
  E.ctx.design.diags.push({ file: E.file, line: loc?.line || 1, col: loc?.col || 1, severity: sev, message: msg, ...(tool ? { tool } : {}) });
}

// ---------------------------------------------------------------- scopes for packages
const BUILTIN_VHDL = new Scope();
BUILTIN_VHDL.def('true', { kind: 'const', val: V.ONE, t: BOOL });
BUILTIN_VHDL.def('false', { kind: 'const', val: V.ZERO, t: BOOL });
for (const [n, sev] of [['note', 0], ['warning', 1], ['error', 2], ['failure', 3]]) BUILTIN_VHDL.def(n, { kind: 'const', val: V.fromInt(sev, 2, false), t: INT });
const BUILTIN_VLOG = new Scope();

function packageScope(ctx, name, file, loc, diagE) {
  if (ctx.pkgScopes.has(name)) return ctx.pkgScopes.get(name);
  const pkg = ctx.lib.packages.get(name) || [...ctx.lib.packages.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!pkg) {
    if (diagE) diag(diagE, `package '${name}' not found`, loc);
    return null;
  }
  const lang = pkg.lang || 'vhdl';
  // (cached before its parent scope is made: packages that refer to each other)
  const sc = new Scope(null);
  ctx.pkgScopes.set(name, sc);
  sc.parent = usesScope(ctx, pkg, lang);
  // package-level signals (e.g. SIMPRIM's GSR / GTS) belong to the package: one per design
  const pinst = { name: pkg.name, path: pkg.name, signals: [], procs: [], children: [], params: [], ports: [] };
  const E = { ctx, lang, sc, inst: pinst, file: pkg.file, timeUnit: lang === 'verilog' ? (pkg.timescale?.unit ?? 1000) : 1, fb: null, prefix: '', slvArith: pkg.slvArith };
  for (const d of pkg.decls) {
    try { bindDecl(E, d); } catch (e) { if (!(e instanceof ElabError)) throw e; diag(E, e.message, e.loc || d.loc); }
  }
  return sc;
}

function usesScope(ctx, mod, lang) {
  const base = lang === 'vhdl' ? BUILTIN_VHDL : BUILTIN_VLOG;
  // SystemVerilog: every package's names by their scoped names (p::W, p::w_t, p::f(x))
  const vpkgs = lang === 'verilog' ? [...ctx.lib.packages.values()].filter(p => p.lang === 'verilog' && p !== mod) : [];
  if ((!mod.uses || !mod.uses.length) && !vpkgs.length) return base;
  if (lang === 'verilog') {
    const scoped = new Map(), imports = [];
    for (const p of vpkgs) { const ps = packageScope(ctx, p.name, mod.file, mod.loc, null); if (ps) scoped.set(p.name, ps); }
    for (const u of mod.uses || []) { const ps = packageScope(ctx, u, mod.file, mod.loc, { ctx, file: mod.file }); if (ps) imports.push(ps); }
    return new ImportScope(base, imports, scoped);
  }
  const sc = new Scope(base);
  for (const u of mod.uses || []) {
    const ps = packageScope(ctx, u, mod.file, mod.loc, { ctx, file: mod.file });
    if (ps) for (const [k, v] of ps.map) { const prev = sc.local(k); sc.def(k, vhdlFunc(prev) && vhdlFunc(v) ? mergeFuncs(prev, v) : v); }
  }
  return sc;
}

// ---------------------------------------------------------------- instances
function elabInstance(ctx, mod, name, path, paramOverrides, portConns, parentInst, depth) {
  if (depth > ctx.design.maxDepth) throw new ElabError(`instance hierarchy too deep at ${path} (recursive instantiation?)`);
  const inst = {
    name, path, module: mod.name, lang: mod.lang, file: mod.archFile || mod.file, loc: mod.loc,
    params: [], ports: [], signals: [], children: [], procs: [], parent: parentInst, mod,
  };
  const E = {
    ctx, lang: mod.lang, sc: new Scope(usesScope(ctx, mod, mod.lang)), inst,
    file: inst.file, timeUnit: mod.timescale?.unit ?? (mod.lang === 'vhdl' ? 1 : 1000), fb: null, prefix: '', depth,
    timePrec: mod.lang === 'verilog' ? mod.timescale?.precision : undefined,   // delays round to the precision
    slvArith: mod.slvArith,   // VHDL: std_logic_vector arithmetic of std_logic_unsigned / std_logic_signed
    deferred: [],             // items naming a generate block elaborated later (hierResolve), retried at the end
  };
  E.modSc = E.sc;             // the module's scope (hierarchical names that start with the module's name)
  // Verilog: the typedefs the parameters' types may name (bound again with the other declarations,
  // once the parameters are known; one that needs a parameter fails here, silently)
  if (mod.lang === 'verilog' && mod.params.some(p => p.type?.kind === 'named')) {
    const diags = ctx.design.diags, n0 = diags.length;
    for (const d of mod.decls) if (d.kind === 'type') { try { bindDecl(E, d); } catch { /* needs a parameter */ } }
    diags.length = n0;
  }
  // parameters / generics
  for (const p of mod.params) {
    let entry, given = false;   // given: set by the instance (generic map / #(…)), not the default
    E.at = p.loc?.line ? p.loc : undefined;   // (for diagnostics without a location, #16)
    try {
      const ov = paramOverrides.get(p.name) ?? paramOverrides.get(p.name.toLowerCase());
      // (an unconstrained array type: the actual gives the range, as light8080's OBJ_CODE : obj_code_t)
      const ptype = p.type ? elabType(E, p.type, true) : null;
      if (ov && !p.local) {
        given = true;
        entry = { kind: 'const', val: ov.val, t: ov.t };
        // a VHDL boolean generic set from Verilog: "TRUE" / "FALSE", as Xilinx writes boolean attributes
        if (ptype?.kind === 'bool' && /^(true|false)$/i.test(ov.val?.str ?? '')) entry = { kind: 'const', val: V.fromBool(/^true$/i.test(ov.val.str)), t: ptype };
        // an unconstrained generic (INIT : std_logic_vector) takes the actual's width
        else if (ptype && ptype.unconstrained && ov.t && ov.t.kind === ptype.kind) entry = { kind: 'const', val: ov.val, t: { ...ov.t, s: ptype.s } };
        else if (ptype?.signedOnly) { const n = signedOnly({ k: 'c', val: ov.val, t: ov.t }); entry = { kind: 'const', val: constOf(E, n, mod.loc), t: n.t }; }
        else if (ptype && ptype.kind !== 'str') entry = { kind: 'const', val: fitVal(ov.val?.str !== undefined && E.lang === 'verilog' ? strToVal(ov.val.str) : ov.val, ptype), t: ptype };
        else if (ptype && ov.text !== undefined) entry = { kind: 'const', val: { str: ov.text }, t: STR };   // NAME => "u1"
      } else if (p.default) {
        let n = strVec(E, bindExpr(E, p.default, ptype));
        if (ptype?.signedOnly) n = signedOnly(n);
        const val = constOf(E, n, p.loc);
        entry = { kind: 'const', val: ptype && ptype.kind !== 'str' && !ptype.signedOnly ? fitVal(val, ptype) : val, t: ptype && !ptype.signedOnly ? ptype : n.t };
      } else throw new ElabError(`generic '${p.name}' has no value`, mod.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || mod.loc);
      entry = { kind: 'const', val: V.fromInt(0), t: INT };
    }
    E.at = undefined;
    E.sc.def(p.name, entry);
    inst.params.push({ name: p.name, value: entry.val, t: entry.t, given });
  }
  // declarations: types & constants first (they may size ports), then ports, then the rest
  // Functions are only registered here (bodies bind at call time), so constants may call them.
  const funcs = mod.decls.filter(d => d.kind === 'function' || d.kind === 'task');
  const early = mod.decls.filter(d => d.kind === 'type' || d.kind === 'const');
  const late = mod.decls.filter(d => !['type', 'const', 'function', 'task'].includes(d.kind));
  for (const d of funcs) safe(E, d.loc, () => bindDecl(E, d));
  for (const d of early) safe(E, d.loc, () => bindDecl(E, d));
  for (const p of mod.ports) safe(E, p.loc, () => elabPort(E, p, portConns.get(p.name)));
  // Silinx's own netlist primitives (core/unisim.js) run as native processes (core/native.js)
  if (String(mod.file || '').startsWith('<silinx>/')) {
    const nat = nativePrimitive(mod.name, inst.params, inst.ports);
    if (nat) {
      // (an output connected to a whole Verilog net is that net: it starts at the primitive's
      // INIT, not at the x of a driven net)
      for (const [sig, v] of nat.init) { sig.init = v; sig.val = v; sig.netZ = false; }
      const proc = addProc(E, { name: mod.name.toUpperCase(), kind: 'native', mode: 'native', native: nat.fn, nativeReset: nat.reset, body: { k: 'null' },
        triggers: nat.inputs.map((sig) => ({ sig, edge: 'any' })), lang: 'vhdl', loc: mod.loc, file: inst.file, inst });
      proc.writes = new Set(nat.outputs);
      // it reads every input pin, not only the ones that trigger it (a flip-flop's D, CE, R: sampled
      // at the clock edge): the design checks see them used (no 'Input <d> is never used.')
      proc.reads = new Set([...nat.inputs, ...inst.ports.filter(pt => pt.dir !== 'out').map(pt => pt.sig)].filter(Boolean));
      return inst;
    }
  }
  for (const d of late) safe(E, d.loc, () => bindDecl(E, d));
  // Verilog defparam: overrides for the parameters of instances below this one (path, value)
  E.defparams = [...(paramOverrides.defparams || [])];
  for (const it of mod.items || []) {
    if (it.kind !== 'defparam') continue;
    safe(E, it.loc, () => {
      const n = bindExpr(E, it.value, null, it.loc);
      E.defparams.push({ path: it.path.split('.'), val: constOf(E, n, it.loc), t: n.t });
    });
  }
  elabItems(E, mod.items);
  // items with a hierarchical name into a generate block that comes after them (a forward
  // reference): elaborated again, now that every generate block exists
  const deferred = E.deferred;
  E.deferred.done = true;
  for (const [GE, it] of deferred) elabItems(GE, [it]);
  return inst;
}

function safe(E, loc, fn) {
  const at = E.at;
  if (loc?.line) E.at = loc;   // the location of what is being bound, for diagnostics without one
  try { return fn(); }
  catch (e) {
    if (e instanceof ElabError || e instanceof SimError) { diag(E, e.message, e.loc || loc); return null; }
    throw e;
  } finally { E.at = at; }
}

export function newSignal(E, name, t, init, kind, loc) {
  const d = E.ctx.design;
  const sig = {
    id: d.signals.length, name, path: `${E.inst.path}.${name}`, t, inst: E.inst, kind,
    init, val: init, prev: null, evStamp: -1, lastT: undefined, waiters: null, wave: null, loc, file: E.file,
  };
  d.signals.push(sig);
  E.inst.signals.push(sig);
  return sig;
}

function elabPort(E, p, conn) {
  const t = elabType(E, p.type);
  if (conn?.arr) conn = arrayConn(E, conn, t.w, p.name);
  if (conn?.aggregate && !conn.node) conn.node = bindExpr(conn.E, conn.aggregate, t, conn.loc);
  let init = defaultValue(t, E.lang);
  // an output variable's initializer that is not constant (output integer q = off + 1;): evaluated
  // once at time 0, as a module variable's (IEEE 1800-2017 10.5)
  let lateInit = null;
  if (p.default) {
    const n = bindExpr(E, p.default, t, p.loc);
    if (E.lang === 'verilog' && p.dir !== 'in' && !isConstNode(n)) { ctxSize(n, t.w); lateInit = n; }
    else init = fitAny(constOf(E, n, p.loc), t);
  }
  const initOnce = sig => {
    const proc = addProc(E, { name: `${E.prefix}${p.name}_init`, kind: 'process', mode: 'initial', body: { k: 'asg', target: { k: 'sig', sig, t, name: p.name }, value: lateInit, nb: false, loc: p.loc },
      triggers: [], lang: E.lang, loc: p.loc, file: E.file });
    proc.declInit = true;
  };
  if (conn && conn.node && conn.node.k === 'sig' && conn.node.t.w === t.w && (t.kind === 'array') === (conn.node.t.kind === 'array') && p.dir !== undefined) {
    const sig = conn.node.sig;
    // VHDL: the driver of an out port starts at the port's default; with the port aliased to its
    // actual that is the actual's initial value (unless the actual was given one itself); Verilog:
    // the initializer of an output variable (output logic [3:0] q = 1)
    if (lateInit) initOnce(sig);
    else if (p.default && p.dir !== 'in' && !sig.portInitSet && !sig.hasInit) {
      sig.init = init; sig.val = init; sig.portInitSet = true;
      if (E.lang === 'verilog') { sig.hasInit = true; sig.netZ = false; }
    }
    if (p.wired && !sig.wired) { sig.wired = p.wired; sig.netZ = false; }   // (input wor x: the net resolves as wired-or)
    E.sc.def(p.name, { kind: 'sig', sig, t });
    E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: true, conn: conn.text, ...(conn.fromArr ? { connNode: conn.node, connLnode: conn.lnode } : {}) });
    return;
  }
  const sig = newSignal(E, p.name, t, init, 'port', p.loc);
  sig.portDir = p.dir;
  if (p.wired) {
    sig.wired = p.wired;
    // (tri0 / tri1: pulled to 0 / 1 while nothing drives it)
    if (!p.default && (p.wired === 'tri0' || p.wired === 'tri1')) sig.init = sig.val = p.wired === 'tri0' ? V.zero(t.w) : V.mk(t.w, V.mask(t.w));
  }
  if (p.default && E.lang === 'verilog' && !lateInit) sig.hasInit = true;   // (input [3:0] d = 10, output logic q = 1)
  if (lateInit) initOnce(sig);
  E.sc.def(p.name, { kind: 'sig', sig, t });
  E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: false, conn: conn?.text ?? null, ...(conn?.fromArr ? { connNode: conn.node, connLnode: conn.lnode } : {}) });
  if (!conn) return;
  const pE = conn.E;
  if (conn.parts) {
    // sub-element associations: one connection per formal part (formal bound in this instance)
    for (const part of conn.parts) {
      const loc = conn.loc;
      if (p.dir === 'in' || (p.dir === 'inout' && !part.lnode)) {
        if (!part.node) continue;
        const target = bindLvalue(E, part.formal, loc);
        const value = part.node;
        if (pE.lang === 'verilog') ctxSize(value, target.t.w);
        const body = { k: 'asg', target, value, nb: false, delay: null, loc };
        addProc(E, { name: `${exprText(part.formal)}<=`, kind: 'glue', mode: 'comb', body, triggers: triggersOfReads(body), lang: 'verilog', loc, file: pE.file, inst: E.inst, glueOf: p.name });
      } else if (part.lnode) {
        const value = bindExpr(E, part.formal, null, loc);
        const body = { k: 'asg', target: part.lnode, value, nb: false, delay: null, loc };
        addProc(pE, { name: `${exprText(part.formal)}=>`, kind: 'glue', mode: 'comb', body, triggers: [{ sig, edge: 'any', pos: null }], lang: 'verilog', loc, file: pE.file, inst: pE.inst, glueOf: `${E.inst.name}.${p.name}` });
      }
    }
    return;
  }
  if (p.dir === 'in' || (p.dir === 'inout' && !conn.lnode)) {
    if (!conn.node) return;
    if (p.dir === 'inout') diag(E, `inout port '${p.name}' connected to an expression is treated as input`, p.loc, 'warning');
    let value = conn.node;
    if (pE.lang === 'verilog') ctxSize(value, t.w);
    const body = { k: 'asg', target: { k: 'sig', sig, t }, value, nb: false, delay: null, loc: conn.loc };
    addProc(E, { name: `${p.name}<=`, kind: 'glue', mode: 'comb', body, triggers: triggersOfReads(body), lang: 'verilog', loc: conn.loc, file: pE.file, inst: E.inst, glueOf: p.name });
  } else if (conn.lnode) {
    const body = { k: 'asg', target: conn.lnode, value: { k: 'sig', sig, t }, nb: false, delay: null, loc: conn.loc };
    addProc(pE, { name: `${p.name}=>`, kind: 'glue', mode: 'comb', body, triggers: [{ sig, edge: 'any' }], lang: 'verilog', loc: conn.loc, file: pE.file, inst: pE.inst, glueOf: `${E.inst.name}.${p.name}` });
  } else if (conn.node) {
    diag(pE, `output port '${p.name}' of '${E.inst.name}' is connected to a non-assignable expression`, conn.loc, 'warning');
  }
}

function addProc(E, proc) {
  proc.inst ||= E.inst;
  proc.id = E.ctx.design.procs.length;
  proc.timeUnit ??= E.timeUnit;
  const rw = collectRW(proc.body);
  proc.reads = rw.reads; proc.writes = rw.writes;
  E.ctx.design.procs.push(proc);
  proc.inst.procs.push(proc);
  return proc;
}

function elabItems(E, items) {
  for (const it of items) {
    try {
      switch (it.kind) {
        case 'assign': elabAssignItem(E, it); break;
        case 'process': elabProcess(E, it); break;
        case 'instance': elabChild(E, it); break;
        case 'generate_for': elabGenFor(E, it); break;
        case 'generate_if': elabGenIf(E, it); break;
        case 'decl': bindDecl(E, it.decl); break;
        case 'defparam': break;   // (applied when the instance it names is elaborated)
        case 'elabtask': elabTask(E, it); break;
        default: diag(E, `unsupported item '${it.kind}'`, it.loc, 'warning');
      }
    } catch (e) {
      if (e instanceof ElabError && e.hier && E.deferred && !E.deferred.done) { E.deferred.push([E, it]); continue; }
      if (e instanceof ElabError || e instanceof SimError) { diag(E, e.message, e.loc || it.loc); continue; }
      throw e;
    }
  }
}

// SystemVerilog elaboration system tasks in a generate scope: $info / $warning / $error / $fatal
// (IEEE 1800-2017 20.11), the message formatted like $display's
function elabTask(E, it) {
  const sev = { $info: 'info', $warning: 'warning', $error: 'error', $fatal: 'error' }[it.name];
  const args = it.name === '$fatal' ? it.args.slice(1) : it.args;
  let msg = '';
  if (args.length) {
    const nodes = args.map(a => (a.op === 'str' ? { k: 'str', value: a.value, t: STR } : bindExpr(E, a, null, it.loc)));
    const vals = nodes.map(n => (n.k === 'str' ? { str: n.value } : constOf(E, n, it.loc)));
    let k = 1;
    msg = vals[0].str !== undefined
      ? vals[0].str.replace(/%(0?\d*)([dDbBhHsS%])/g, (m, w, f) => {
        if (f === '%') return '%';
        const v = vals[k++];
        if (!v) return m;
        if (v.str !== undefined) return v.str;
        return f === 'b' || f === 'B' ? V.toBin(v) : f === 'h' || f === 'H' ? V.toHex(v) : V.toDec(v, !!v.s);
      }) + vals.slice(k).map(v => (v.str !== undefined ? v.str : V.toDec(v, !!v.s))).join('')
      : vals.map(v => (v.str !== undefined ? v.str : V.toDec(v, !!v.s))).join('');
  }
  diag(E, `${it.name}${msg ? `: ${msg}` : ''}`, it.loc, sev);
}

function elabAssignItem(E, it) {
  // Verilog: an undeclared target of a continuous assignment is an implicit scalar net
  const target = bindLvalue(E.lang === 'verilog' ? { ...E, implicitNets: true } : E, it.target, it.loc);
  // (and so is an undeclared input of a gate primitive: and g(o, a, undeclared))
  const value = bindExpr(it.gate && E.lang === 'verilog' ? { ...E, implicitNets: true } : E, it.value, target.t, it.loc);
  if (E.lang === 'verilog') ctxSize(value, target.t.w);
  checkAssignable(E, target, value, it.loc);
  const body = { k: 'asg', target, value, nb: E.lang === 'vhdl', delay: it.delay ? bindExpr(E, it.delay) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, prec: E.timePrec, loc: it.loc };
  if (E.lang === 'vhdl') { Object.assign(body, vhdlMech(E, it)); rangeCheck(body); }
  else if (body.delay) body.inertial = true;   // Verilog: a change before the delay elapses replaces the pending one
  addProc(E, {
    name: `assign_${it.loc?.line ?? ''}`, kind: 'assign', mode: 'comb', body, triggers: triggersOfReads(body),
    lang: E.lang, loc: it.loc, file: E.file, item: it,
  });
}

function elabProcess(E, it) {
  const fb = new FrameBuilder();
  // procRef: the process, once added (its named blocks' variables are read from its frame by
  // hierarchical names: dut.blk.v, #12)
  const PE = { ...E, sc: new Scope(E.sc), fb, inProcess: true, procRef: {}, blockPath: [] };
  for (const d of it.decls || []) bindDecl(PE, d);
  const body = bindBlock(PE, it.body, it.loc);
  let mode, triggers = [];
  if (it.sens === null) mode = it.initial ? 'initial' : 'loop';
  else if (it.sens === 'all') { mode = 'comb'; triggers = triggersOfReads(body); }
  else {
    triggers = it.sens.flatMap(s => bindTrigger(PE, s.expr, s.edge, it.loc));
    const edged = triggers.some(t => t.edge !== 'any');
    mode = E.lang === 'vhdl' ? 'sens' : (edged ? 'wait-first' : 'comb');
  }
  const label = it.label || (it.initial ? `initial_${it.loc?.line}` : `${E.lang === 'vhdl' ? 'process' : 'always'}_${it.loc?.line}`);
  const proc = addProc(E, {
    name: E.prefix + label, kind: 'process', mode, body, triggers, lang: E.lang, loc: it.loc, file: E.file,
    frameInit: fb.makeInit(), item: it, sens: it.sens,
  });
  // (not enumerable: the expression walkers do not go from a reference into the whole process)
  Object.defineProperty(PE.procRef, 'proc', { value: proc, enumerable: false });
}

function elabChild(E, it) {
  const mod = findModule(E.ctx.lib, it.module);
  const name = E.prefix + it.name;
  // bind connection expressions in the parent scope
  const conns = [];
  const childPorts = mod ? mod.ports : [];
  const ci = !mod || mod.lang === 'vhdl' || E.lang === 'vhdl';
  it.conns.forEach((c, k) => {
    if (c.port === '*') {
      for (const p of childPorts) {
        if (conns.some(x => x.port === p.name)) continue;
        if (E.sc.lookup(p.name)) conns.push({ port: p.name, expr: { op: 'ref', name: p.name } });
      }
      return;
    }
    let pname = c.port;
    if (pname == null) {
      if (!mod) pname = `p${k}`;
      else if (k >= childPorts.length) { diag(E, `too many port connections for '${it.module}'`, it.loc); return; }
      else pname = childPorts[k].name;
    } else if (mod) {
      const p = childPorts.find(p => p.name === pname) || (ci && childPorts.find(p => p.name.toLowerCase() === pname.toLowerCase()));
      if (!p) { diag(E, `module '${mod.name}' has no port '${pname}'`, it.loc); return; }
      pname = p.name;
    }
    conns.push({ port: pname, expr: c.expr, formal: c.formal || null });
  });
  const portConns = new Map();
  for (const c of conns) {
    if (!c.expr) continue;
    const pdecl = childPorts.find(p => p.name === c.port);
    let node = null, lnode = null;
    try {
      // VHDL `P => (others => '0')`: an aggregate takes the type of the port, known once the instance's
      // generics are (bound in elabPort)
      if (E.lang === 'vhdl' && c.expr.op === 'aggregate' && !c.formal && pdecl && pdecl.dir === 'in' && c.expr.items.some(i => i.choices)) {
        portConns.set(c.port, { node: null, aggregate: c.expr, E, loc: it.loc, text: exprText(c.expr) });
        continue;
      }
      node = bindExpr({ ...E, implicitNets: true }, c.expr, null, it.loc);
      if (pdecl && pdecl.dir !== 'in' && isLvalueExpr(c.expr)) lnode = bindLvalue({ ...E, implicitNets: true }, c.expr, it.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || it.loc);
      continue;
    }
    if (c.formal) {
      // VHDL `P(3) => a, P(2) => b` / `P(7 downto 4) => x`: each sub-element formal connects its own bits
      let pc = portConns.get(c.port);
      if (!pc || !pc.parts) { pc = { parts: [], node: null, lnode: null, E, loc: it.loc, text: '' }; portConns.set(c.port, pc); }
      pc.parts.push({ formal: c.formal, node, lnode, text: exprText(c.expr) });
      pc.text = pc.parts.map(x => `${exprText(x.formal)} => ${x.text}`).join(', ');
      continue;
    }
    portConns.set(c.port, { node, lnode, E, loc: it.loc, text: exprText(c.expr) });
  }
  if (!mod) {
    diag(E, `module/entity '${it.module}' not found (instance '${it.name}')`, it.loc);
    const bb = { name, path: `${E.inst.path}.${name}`, module: it.module, lang: null, blackbox: true, ports: [], signals: [], children: [], procs: [], params: [], parent: E.inst, loc: it.loc, file: E.file };
    bb.connInfo = [...portConns].map(([port, c]) => ({ port, dir: 'inout', node: c.node, text: c.text, reads: readsOf(c.node) }));
    E.inst.children.push(bb);
    return;
  }
  // parameter overrides
  const ov = new Map();
  it.params.forEach((p, k) => {
    if (!p.value) return;
    let pname = p.name;
    if (pname == null) {
      const nonLocal = mod.params.filter(x => !x.local);
      if (k >= nonLocal.length) { diag(E, `too many parameter overrides for '${mod.name}'`, it.loc); return; }
      pname = nonLocal[k].name;
    } else {
      const decl = mod.params.find(x => x.name === pname || (ci && x.name.toLowerCase() === pname.toLowerCase()));
      if (!decl) {
        // Silinx's own primitive models (UNISIM / SIMPRIM) ignore attributes they do not model
        const prim = String(mod.file || '').startsWith('<silinx>/');
        diag(E, prim ? `primitive '${mod.name}': generic '${pname}' is not modelled, ignored` : `module '${mod.name}' has no parameter '${pname}'`, it.loc, prim ? 'warning' : undefined);
        return;
      }
      pname = decl.name;
    }
    // VHDL `G => (others => '0')`: an aggregate takes the generic's declared type (when it does not
    // depend on the instance's other generics)
    let expect = null;
    if (E.lang === 'vhdl' && p.value.op === 'aggregate') {
      const pd = mod.params.find(x => x.name === pname);
      try { if (pd?.type) expect = elabType(E, pd.type); } catch (e) { if (!(e instanceof ElabError)) throw e; }
    }
    const n = bindExpr(E, p.value, expect, it.loc);
    ov.set(pname, { val: constOf(E, n, it.loc), t: n.t, text: n.strText });
  });
  // defparams naming this instance: its own parameters, and the ones further down (passed on)
  // (an instance in generate blocks is named by them: foo.mod_a, bar[0].mod_b)
  const segs = name.split('.');
  for (const dp of E.defparams || []) {
    if (dp.path.length <= segs.length || segs.some((s, i) => s !== dp.path[i])) continue;
    const rest = dp.path.slice(segs.length);
    if (rest.length > 1) { (ov.defparams ||= []).push({ ...dp, path: rest }); continue; }
    const decl = mod.params.find(x => x.name === rest[0] || (ci && x.name.toLowerCase() === rest[0].toLowerCase()));
    if (!decl) { diag(E, `defparam: module '${mod.name}' has no parameter '${rest[0]}'`, it.loc); continue; }
    ov.set(decl.name, { val: dp.val, t: dp.t });
  }
  // an array of instances (u [3:0] (…), IEEE 1364-2005 12.1.2): one instance per index, u[3] … u[0];
  // an actual as wide as the port goes to every instance, one n times as wide is split, its most
  // significant part to the leftmost index (arrayConn, when the port's width is known)
  let idxs = [null];
  if (it.array) {
    const r = evalRange(E, it.array);
    idxs = [];
    for (let k = r.left; ; k += r.left > r.right ? -1 : 1) { idxs.push(k); if (k === r.right) break; }
  }
  idxs.forEach((idx, j) => {
    const iname = idx === null ? name : `${name}[${idx}]`;
    let pc = portConns;
    if (idx !== null) pc = new Map([...portConns].map(([k, c]) => [k, c.parts ? c : { ...c, arr: { n: idxs.length, j } }]));
    const child = elabInstance(E.ctx, mod, iname, `${E.inst.path}.${iname}`, ov, pc, E.inst, (E.depth || 0) + 1);
    child.loc = it.loc; child.instFile = E.file;
    child.connInfo = mod.ports.map(p => {
      const c = pc.get(p.name);
      const port = child.ports.find(x => x.name === p.name);
      const parts = c?.parts || [];
      const node = port?.connNode ?? c?.node ?? null, lnode = port?.connLnode ?? c?.lnode;
      return {
        port: p.name, dir: p.dir, t: port?.t, text: c?.text ?? null, node,
        reads: node ? readsOf(node) : new Set(parts.flatMap(x => (x.node ? [...readsOf(x.node)] : []))),
        writes: lnode ? writesOfL(lnode) : new Set(parts.flatMap(x => (x.lnode ? [...writesOfL(x.lnode)] : []))),
      };
    });
    for (const p of mod.ports) {
      if (p.dir === 'in' && !portConns.has(p.name) && !p.default)
        diag(E, `input port '${p.name}' of '${iname}' is not connected`, it.loc, 'warning');
    }
    E.inst.children.push(child);
  });
}

// The bits of lvalue L from bit lo, w bits (a concatenation: the parts these bits fall in)
function sliceL(L, lo, w) {
  if (lo === 0 && w === L.t.w) return L;
  if (L.k !== 'cat') return { k: 'slice', base: L, lo, t: vecT(w) };
  const pieces = [];
  let off = 0;
  for (let k = L.parts.length - 1; k >= 0; k--) {
    const P = L.parts[k], pw = P.t.w;
    const a = Math.max(lo, off), b = Math.min(lo + w, off + pw);
    if (a < b) pieces.unshift(sliceL(P, a - off, b - a));
    off += pw;
  }
  return pieces.length === 1 ? pieces[0] : { k: 'cat', parts: pieces, t: vecT(w) };
}

// The connection of one instance of an array of instances to a port of w bits
function arrayConn(E, conn, w, pname) {
  const { n, j } = conn.arr;
  const c = { ...conn };
  delete c.arr;
  const aw = (conn.node || conn.lnode)?.t?.w;
  if (aw === undefined || aw === w) return c;
  if (aw !== n * w) {
    diag(conn.E, `port '${pname}': the actual has ${aw} bits, neither ${w} nor ${n} x ${w}`, conn.loc, 'warning');
    return c;
  }
  const lo = (n - 1 - j) * w;
  c.fromArr = true;
  if (c.node) c.node = { k: 'slice', base: c.node, lo, t: vecT(w) };
  if (c.lnode) c.lnode = sliceL(c.lnode, lo, w);
  return c;
}

// Generate blocks are scopes of their own: a named one (or an unnamed one, genblk<n>) is entered
// in the enclosing scope as { kind: 'gen', sc }, a generate loop as { kind: 'genarr', elems: index ->
// { kind: 'gen', sc } }, so that hierarchical names reach into them (hierResolve).
function elabGenFor(E, it) {
  const genScope = new Scope(E.sc);
  const GE0 = { ...E, sc: genScope };
  let i = constOf(GE0, bindExpr(GE0, it.init), it.loc);
  let guard = 0;
  const arr = { kind: 'genarr', elems: new Map() };
  if (it.label) E.sc.def(it.label, arr);
  for (;;) {
    const sc = new Scope(E.sc);
    sc.def(it.var, { kind: 'const', val: V.resize(V.withSign(i, true), 32), t: INT });
    const GE = { ...E, sc };
    if (!V.isTrue(constOf(GE, bindExpr(GE, it.cond), it.loc))) break;
    if (++guard > 4096) throw new ElabError('generate loop does not terminate', it.loc);
    const idx = V.toDec(i, true);
    GE.prefix = `${E.prefix}${it.label}[${idx}].`;
    arr.elems.set(Number(idx), { kind: 'gen', sc });
    for (const d of it.decls || []) safe(GE, d.loc, () => bindDecl(GE, d));
    elabItems(GE, it.items);
    i = constOf(GE, bindExpr(GE, it.step), it.loc);
  }
}

function elabGenIf(E, it) {
  const c = V.isTrue(constOf(E, bindExpr(E, it.cond), it.loc));
  // else if / the next case alternative: the same construct, in the same scope
  if (!c && it.elseChain) { elabItems(E, it.else); return; }
  if (!c && !it.else?.length && !it.elseDecls?.length) return;
  const label = c ? it.label : it.elseLabel ?? it.label;
  const sc = new Scope(E.sc);
  const GE = { ...E, sc, prefix: label ? `${E.prefix}${label}.` : E.prefix };
  if (label) E.sc.def(label, { kind: 'gen', sc });
  for (const d of (c ? it.decls : it.elseDecls) || []) safe(GE, d.loc, () => bindDecl(GE, d));
  elabItems(GE, (c ? it.then : it.else) || []);
}

// ---------------------------------------------------------------- declarations
export function bindDecl(E, d) {
  switch (d.kind) {
    case 'type': {
      if (d.type.kind === 'enum') {
        const n = d.type.values.length;
        const w = Math.max(1, Math.ceil(Math.log2(n)));
        const t = { kind: 'enum', name: d.name, names: d.type.values, w, s: false, left: w - 1, right: 0, desc: true };
        E.sc.def(d.name, { kind: 'type', t });
        d.type.values.forEach((nm, i) => E.sc.def(nm, { kind: 'const', val: V.fromInt(i, w, false), t }));
        return;
      }
      if (d.type.kind === 'array' && !d.type.range) {
        E.sc.def(d.name, { kind: 'type', t: null, unconstrained: d.type, name: d.name });
        return;
      }
      const t = { ...elabType(E, d.type), name: d.name };
      E.sc.def(d.name, { kind: 'type', t });
      return;
    }
    case 'const': {
      const t = d.type ? elabType(E, d.type, true) : null;
      let n = bindExpr(E, d.value, t, d.loc);
      if (t?.signedOnly) n = signedOnly(n);
      else if (E.lang === 'verilog' && t) { n = strVec(E, n); ctxSize(n, t.w); }
      let val = constOf(E, n, d.loc);
      let ft = t;
      if (!t || (t.kind === 'logic' && t.unconstrained) || t.signedOnly) ft = n.t;
      else val = fitAny(val, t);
      E.sc.def(d.name, { kind: 'const', val, t: ft });
      return;
    }
    case 'signal': {
      const t = elabType(E, d.type);
      let init = defaultValue(t, E.lang, d.net);
      let lateInit = null;
      if (d.init) {
        const n = bindExpr(E, d.init, t, d.loc);
        if (E.lang === 'verilog') ctxSize(n, t.w);
        // a module variable's initializer that is not constant (integer b = a + 1;, IEEE 1800-2017
        // 10.5): evaluated once at time 0, before the initial and always procedures start
        if (E.lang === 'verilog' && !E.fb && !isConstNode(n)) lateInit = n;
        else if (E.lang === 'verilog' && E.fb && !isConstNode(n)) {
          // (an automatic one's initializer is an assignment at each entry: the parser made it so)
          throw new ElabError(`'${d.name}': a static variable of a block or a subprogram is initialized once, before time 0: its initializer must be constant; declare it automatic to initialize it at each entry (IEEE 1800-2017 6.21)`, d.loc);
        } else init = fitAny(constOf(E, n, d.loc), t);
      }
      if (E.fb && (d.net === 'variable' || E.inProcess)) {
        const i = E.fb.alloc(t, init);
        E.sc.def(d.name, { kind: 'loc', i, t, lvl: E.fb.level });
        return;
      }
      if (E.sc.local(d.name) && E.sc.local(d.name).kind === 'sig') { diag(E, `'${d.name}' redeclared`, d.loc, 'warning'); return; }
      // Verilog: a net without drivers is z (tri0 / tri1: pulled to 0 / 1)
      if (E.lang === 'verilog' && d.net === 'wire' && !d.init && t.kind === 'logic') init = d.wired === 'tri0' ? V.zero(t.w) : d.wired === 'tri1' ? V.mk(t.w, V.mask(t.w)) : V.mk(t.w, V.mask(t.w), V.mask(t.w), t.s);
      const sig = newSignal(E, E.prefix + d.name, t, init, d.net === 'variable' ? 'var' : 'signal', d.loc);
      if (d.init && !lateInit) sig.hasInit = true;
      if (lateInit) {
        const proc = addProc(E, { name: `${E.prefix}${d.name}_init`, kind: 'process', mode: 'initial', body: { k: 'asg', target: { k: 'sig', sig, t, name: d.name }, value: lateInit, nb: false, loc: d.loc },
          triggers: [], lang: E.lang, loc: d.loc, file: E.file });
        proc.declInit = true;   // (runs before the procedures: the simulator starts it first)
      }
      if (d.net === 'reg') sig.net = 'reg';   // (Verilog reg: a variable in VCD files)
      if (d.wired) sig.wired = d.wired;
      if (E.lang === 'verilog' && d.net === 'wire' && !d.init && t.kind === 'logic' && !d.wired) sig.netZ = true;   // (x once it has drivers)
      E.sc.def(d.name, { kind: 'sig', sig, t });
      return;
    }
    case 'function': case 'task': {
      // (outerFb: the frame of the process or subprogram it is declared in, whose variables it uses)
      const ent = { kind: 'func', decl: d, E: { ...E, fb: null, outerFb: E.fb, inProcess: false }, cache: new Map() };
      // VHDL overloading: subprograms of one name in one region (chosen per call: pickOverload)
      const prev = E.lang === 'vhdl' ? E.sc.local(d.name) : null;
      if (prev && prev.kind === 'func') ent.alts = [...(prev.alts || [prev]), ent];
      E.sc.def(d.name, ent);
      return;
    }
    // a VHDL file object: a name (procedures take it as a file parameter; textio writes are ignored)
    // (its value: the external file's name, with its open mode, for textio's readline / writeline)
    case 'file': E.sc.def(d.name, { kind: 'const', val: { str: d.ext ?? d.name, mode: d.mode || 'read_mode' }, t: STR, file: true }); return;
    case 'subalias': defSubAlias(E, d.name, d.target); return;
    case 'alias': {   // VHDL object alias: reads and writes go to the aliased object (or slice)
      // `alias f is g;` without a signature: an alias of subprogram g when g is one
      if (d.target.op === 'ref' && !d.type) {
        const te = E.sc.lookup(d.target.name);
        if (te ? te.kind === 'func' || te.kind === 'subalias' : BUILTIN_SUBPROGRAMS.has(d.target.name)) { defSubAlias(E, d.name, d.target.name); return; }
      }
      const rv = bindExpr(E, d.target, null, d.loc);
      const lv = isLvalueExpr(d.target) && rv.k !== 'c' ? bindLvalue(E, d.target, d.loc) : null;
      if (rv.k === 'c') { E.sc.def(d.name, { kind: 'const', val: rv.val, t: rv.t }); return; }
      E.sc.def(d.name, { kind: 'alias', rv, lv, t: rv.t });
      return;
    }
    default:
      return;
  }
}

// A packed array of elements of type elem (SystemVerilog logic [0:3][7:0], my_t [3:0]): a vector
// [n * w - 1 : 0] whose packed.left / right / desc are the declared range of its elements
function packedOf(E, range, elem, signed = false) {
  const { left, right, desc } = evalRange(E, range);
  const n = Math.abs(left - right) + 1, w = n * elem.w;
  return { kind: 'logic', w, s: !!signed, left: w - 1, right: 0, desc: true, packed: { left, right, desc, n, elem } };
}

export function elabType(E, ts, allowUnconstrained = false) {
  // SystemVerilog packed dimensions after the first one (logic [0:3][7:0]): the outer dimensions
  // are arrays of the inner ones
  if (ts.kind === 'logic' && ts.inner?.length) {
    const elem = elabType(E, { ...ts, range: ts.inner[0], inner: ts.inner.slice(1), signed: false });
    return packedOf(E, ts.range, elem, ts.signed);
  }
  if ((ts.kind === 'named' || ts.kind === 'struct' || ts.kind === 'svenum') && ts.dims?.length) {
    const elem = elabType(E, { ...ts, dims: ts.dims.slice(1) });
    return packedOf(E, ts.dims[0], elem);
  }
  switch (ts.kind) {
    case 'struct': {
      // packed structure: the first member is the most significant
      const fields = ts.fields.map(f => ({ name: f.name, t: elabType(E, f.type) }));
      // (a packed union: every member from bit 0, the union as wide as its widest member)
      if (ts.union) {
        const w = Math.max(0, ...fields.map(f => f.t.w));
        return { kind: 'logic', w, s: !!ts.signed, left: w - 1, right: 0, desc: true, members: fields.map(f => ({ name: f.name, t: f.t, lo: 0 })) };
      }
      let lo = fields.reduce((a, f) => a + f.t.w, 0);
      const w = lo;
      const members = fields.map(f => { lo -= f.t.w; return { name: f.name, t: f.t, lo }; });
      return { kind: 'logic', w, s: !!ts.signed, left: w - 1, right: 0, desc: true, members };
    }
    case 'svenum': {
      // the names are constants of the base type (int by default): each one more than the one
      // before it, unless it is given a value (IEEE 1800-2017 6.19)
      const base = ts.base ? elabType(E, ts.base) : INT;
      let next = V.fromInt(0, base.w, !!base.s);
      for (const it of ts.items) {
        if (it.value) {
          const n = bindExpr(E, it.value, base, it.loc);
          ctxSize(n, base.w);
          next = fitAny(constOf(E, n, it.loc), base);
        }
        E.sc.def(it.name, { kind: 'const', val: next, t: base });
        next = V.withSign(V.add(next, V.fromInt(1, base.w, false), base.w, !!base.s), !!base.s);
      }
      return base;
    }
    case 'logic': {
      // mark: std_logic_vector / bit_vector (not the numeric_std unsigned / signed types)
      const mk = ts.mark ? { mark: ts.mark } : null;
      // a Verilog parameter declared `signed` without a range: the range of its value (signedOnly)
      if (!ts.range && ts.signedOnly) return { ...BIT, s: true, signedOnly: true };
      if (!ts.range) {
        if (ts.unconstrained) return { ...vecT(1, ts.signed), unconstrained: true, ...mk };
        return { ...BIT, s: !!ts.signed };
      }
      const r = evalRange(E, ts.range), { left, right, desc } = r;
      const w = rangeLen(r);
      return { kind: 'logic', w, s: !!ts.signed, left, right, desc, ...mk };
    }
    case 'integer': {
      const t = { ...INT };
      if (ts.range) {
        const r = evalRange(E, ts.range);
        t.rlo = Math.min(r.left, r.right); t.rhi = Math.max(r.left, r.right);
        // its bounds and direction as written (#61): `range 10 downto 0` ('left is the high bound),
        // and a null range (`range 5 to 3`: no value, 'low = 'left) kept null
        t.rleft = r.left; t.rright = r.right;
        if (r.desc) t.rdown = true;
        if (r.isNull) t.rnull = true;
      }
      return t;
    }
    case 'boolean': return BOOL;
    case 'time': return TIME;
    case 'real': return REAL;
    // string(1 to n): its length, for its default value (n times character'left: a variable that is
    // then written character by character, neorv32's to_hexstring_f)
    case 'string': {
      if (!ts.range) return STR;
      const r = evalRange(E, ts.range);
      return { ...STR, slen: rangeLen(r) };
    }
    case 'character': return CHAR;
    case 'array': {
      const elem = elabType(E, ts.elem);
      if (!ts.range) return { kind: 'array', unconstrained: true, elem, w: 0 };
      const r = evalRange(E, ts.range), { left, right, desc } = r;
      const lo = Math.min(left, right), len = rangeLen(r);
      if (len > 1 << 22) throw new ElabError(`array too large (${len} elements)`);
      return { kind: 'array', left, right, desc, lo, len, elem, w: elem.w };
    }
    case 'named': {
      const e = E.sc.lookup(ts.name);
      if (!e || e.kind !== 'type') {
        const std = stdTypeName(ts.name);
        if (std) return elabType(E, { ...std, range: ts.range || null });
        throw new ElabError(`unknown type '${ts.name}'`);
      }
      if (e.unconstrained) {
        if (!ts.range) {
          if (allowUnconstrained) return { kind: 'array', unconstrained: true, elem: elabType(E, e.unconstrained.elem), w: 0, name: e.name };
          throw new ElabError(`unconstrained type '${ts.name}' needs an index range`);
        }
        return { ...elabType(E, { ...e.unconstrained, range: ts.range }), name: e.name };
      }
      if (ts.range && e.t.kind === 'logic') return elabType(E, { kind: 'logic', range: ts.range, signed: e.t.s, mark: e.t.mark });
      if (E.lang === 'verilog' && e.t?.name) { const { name, ...t } = e.t; return t; }   // (a Verilog typedef: the type itself)
      return e.t;
    }
    case 'enum': throw new ElabError('anonymous enum types are not supported');
    case 'record': {
      // a record is an array of its fields (values: JS arrays), with one type per field
      const fields = ts.fields.map(f => ({ name: f.name, t: elabType(E, f.type) }));
      const n = fields.length;
      return { kind: 'array', fields, left: 0, right: n - 1, desc: false, lo: 0, len: n, elem: fields[0]?.t || INT, w: fields.reduce((a, f) => a + (f.t.w || 0), 0) };
    }
  }
  throw new ElabError(`unsupported type '${ts.kind}'`);
}

export function stdTypeName(n) {
  switch (n.toLowerCase()) {
    case 'std_logic': case 'std_ulogic': case 'bit': return { kind: 'logic', range: null, signed: false };
    case 'std_logic_vector': case 'std_ulogic_vector': return { kind: 'logic', range: null, signed: false, unconstrained: true, mark: 'std_logic_vector' };
    // std.textio's TEXT (a file of lines) and LINE: names only (reading / writing files is not
    // modelled: textio calls are ignored with a warning)
    case 'text': case 'line': return { kind: 'string' };
    case 'bit_vector': return { kind: 'logic', range: null, signed: false, unconstrained: true, mark: 'bit_vector' };
    case 'unsigned': return { kind: 'logic', range: null, signed: false, unconstrained: true };
    case 'signed': return { kind: 'logic', range: null, signed: true, unconstrained: true };
    case 'integer': return { kind: 'integer', range: null };
    case 'natural': case 'positive': {
      const lit = v => ({ op: 'int', value: String(v) });
      return { kind: 'integer', range: { left: lit(n.toLowerCase() === 'natural' ? 0 : 1), right: lit(2147483647), dir: 'to' } };
    }
    case 'boolean': return { kind: 'boolean' };
    case 'time': return { kind: 'time' };
    case 'real': return { kind: 'real' };
    case 'string': return { kind: 'string' };
    case 'character': return { kind: 'character' };
  }
  return null;
}

export function evalRange(E, r) {
  const er = evalRange0(E, r);
  // VHDL null range (`-1 downto 0`, `0 to -1`, IEEE 1076-2008 5.2.1): no element (a Verilog range
  // takes its direction from its bounds, so it is never null)
  if (er.desc ? er.left < er.right : er.left > er.right) er.isNull = true;
  return er;
}

function evalRange0(E, r) {
  if (r.of && r.of.op === 'ref' && (E.sc.lookup(r.of.name)?.kind === 'type' || (!E.sc.lookup(r.of.name) && stdTypeName(r.of.name)))) {
    // the range of a (sub)type: integer subtypes, enumerations, constrained vectors
    const te = E.sc.lookup(r.of.name);
    const t = te ? te.t : elabType(E, stdTypeName(r.of.name));
    if (!t) throw new ElabError(`'${r.of.name}' has no range`, r.of.loc);
    let lr;
    if (t.kind === 'int') lr = scalarBounds(t);
    else if (t.kind === 'enum') lr = [0, t.names.length - 1];
    else if (t.kind === 'bool') lr = [0, 1];
    else lr = [t.left, t.right];
    const desc = t.kind === 'int' ? !!t.rdown : t.kind === 'enum' || t.kind === 'bool' ? false : t.desc;
    if (r.reverse) return { left: lr[1], right: lr[0], desc: !desc };
    return { left: lr[0], right: lr[1], desc };
  }
  if (r.of) {
    const n = bindExpr(E, r.of, null);
    const t = n.t;
    if (t.kind === 'str') throw new ElabError("'range of a string is not supported (use std_logic_vector)", r.of.loc);
    if (r.reverse) return { left: t.right, right: t.left, desc: !t.desc };
    return { left: t.left, right: t.right, desc: t.desc };
  }
  const left = V.toNum(constOf(E, bindExpr(E, r.left), r.left.loc));
  const right = V.toNum(constOf(E, bindExpr(E, r.right), r.right.loc));
  const desc = r.dir ? r.dir === 'downto' : left >= right;
  return { left, right, desc };
}

// The number of elements of an evaluated range (0 for a VHDL null range)
const rangeLen = r => (r.isNull ? 0 : Math.abs(r.left - r.right) + 1);

// [left, right] of an integer (sub)type, as declared (integer: -2**31 to 2**31 - 1)
export const scalarBounds = t => (t.rleft !== undefined ? [t.rleft, t.rright]
  : t.rlo !== undefined ? (t.rdown ? [t.rhi, t.rlo] : [t.rlo, t.rhi]) : [-2147483648, 2147483647]);

export function defaultValue(t, lang, net) {
  switch (t.kind) {
    case 'logic': return V.allX(t.w, t.s);
    case 'int': {
      if (lang === 'verilog') return V.allX(32, true);
      return V.fromInt(scalarBounds(t)[0], 32, true);   // T'left
    }
    case 'bool': return V.ZERO;
    case 'enum': return V.mk(t.w, 0n);
    case 'time': return V.fromInt(0, 64, true);
    case 'real': return V.fromInt(0, 64, true);
    case 'str': return { str: t.slen ? '\u0000'.repeat(t.slen) : '' };
    case 'array':
      if (t.fields) return t.fields.map(f => defaultValue(f.t, lang, net));
      return t.unconstrained ? [] : Array.from({ length: t.len }, () => defaultValue(t.elem, lang, net));
  }
  return V.allX(t.w || 1);
}

// The dimensions of a type, { left, right } each: the unpacked ones (arrays), then the packed ones
export function dimsOf(t) {
  if (t.kind === 'array' && !t.fields) return [{ left: t.left, right: t.right }, ...dimsOf(t.elem)];
  if (t.packed) return [{ left: t.packed.left, right: t.packed.right }, ...dimsOf(t.packed.elem)];
  if (t.kind === 'logic' || t.kind === 'int' || t.kind === 'enum') return [{ left: t.left, right: t.right }];
  return [];
}

// A Verilog string used as a value: a vector of 8 bits per character (IEEE 1364-2005 3.6)
export function strVec(E, n) {
  if (E.lang !== 'verilog' || n.t.kind !== 'str') return n;
  const str = n.k === 'str' ? n.value : n.k === 'c' && n.val?.str !== undefined ? n.val.str : null;
  if (str === null) return n;
  const val = strToVal(str);
  return { k: 'c', val, t: vecT(val.w) };
}

// the value of a parameter declared `signed` without a range: its own width, signed; a real value
// converted to an integer
function signedOnly(n) {
  if (n.t.kind === 'real') return fold({ k: 'conv', a: n, ext: true, rtoi: true, round: true, t: INT });
  if (n.t.kind === 'str') return n;
  return fold({ k: 'conv', a: n, ext: !!n.t.s, t: n.t.kind === 'int' ? INT : vecT(n.t.w, true) });
}

export function fitVal(v, t) {
  if (v.str !== undefined || Array.isArray(v)) return v;
  return V.withSign(V.resize(v, t.w), t.s);
}
function fitAny(v, t) {
  if (t.kind === 'str') return v.str !== undefined ? v : { str: String(V.toDec(v)) };
  if (t.kind === 'array') {
    if (!Array.isArray(v)) throw new ElabError('array value expected');
    return v.map((e, k) => fitAny(e, t.fields ? t.fields[k].t : t.elem));
  }
  if (v.str !== undefined) return fitVal(strToVal(v.str), t);
  return fitVal(v, t);
}

// ---------------------------------------------------------------- constant evaluation
function constCtx() { return { frame: [], sim: null, depth: 0 }; }

export function constOf(E, n, loc) {
  if (n.k === 'c') return n.val;
  if (!isConstNode(n)) throw new ElabError('expression is not constant', loc);
  try { return evalE(n, constCtx()); }
  catch (e) { throw new ElabError(e.message, loc); }
}

export function isConstNode(n) {
  switch (n.k) {
    case 'c': case 'str': return true;
    case 'sig': case 'loc': case 'edge': case 'event': case 'sys': case 'now': case 'sigattr': case 'textio_eof': return false;
    case 'chr': return isConstNode(n.base) && isConstNode(n.index);
    case 'strlen': return isConstNode(n.a);
    case 'call': return !n.fn.impure && n.args.every(isConstNode);
    default:
      for (const key of ['a', 'b', 'c', 'base', 'index', 'left', 'right', 'start', 'count']) if (n[key] && typeof n[key] === 'object' && n[key].k && !isConstNode(n[key])) return false;
      for (const key of ['parts', 'elems', 'args']) if (n[key] && !n[key].every(isConstNode)) return false;
      return true;
  }
}

export function fold(n) {
  if (n.k !== 'c' && isConstNode(n) && n.k !== 'str') {
    try {
      const v = evalE(n, constCtx());
      // src: the expression, re-evaluated if Verilog context sizing widens it (ctxSize)
      return { k: 'c', val: v, t: n.t, src: n };
    } catch { return n; }
  }
  return n;
}

// Verilog context-determined sizing: propagate an evaluation width into the expression
// (self-determined operands are sized with their own width), and the signedness of the expression:
// the operands of a context-determined operator take the sign of the whole expression before they
// are extended (IEEE 1364-2005 5.5.4: in `u + (s1 + s2)` with an unsigned u, s1 and s2 are
// zero-extended). n.es is that evaluation sign (n.t.s stays the operator's own type).
export function ctxSize(n, w, s = n?.t?.s) {
  if (!n || !n.t) return;
  const self = x => { if (x && x.t) ctxSize(x, x.t.w, x.t.s); };
  s = !!s;
  switch (n.k) {
    case 'bin': {
      const o = n.o;
      if (['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(o)) {
        // the operands are sized (and signed) with each other, not with the context
        const m = Math.max(n.a.t.w, n.b.t.w), os = !!(n.a.t.s && n.b.t.s);
        n.cw = m; ctxSize(n.a, m, os); ctxSize(n.b, m, os);
        return;
      }
      if (o === '&&' || o === '||') { self(n.a); self(n.b); return; }
      n.ew = Math.max(n.t.w, w);
      n.es = s;
      ctxSize(n.a, n.ew, s);
      if (!['<<', '>>', '<<<', '>>>', '**', 'rol', 'ror'].includes(o)) ctxSize(n.b, n.ew, s);
      else self(n.b);
      return;
    }
    case 'un':
      if (n.o === '~' || n.o === '-') { n.ew = Math.max(n.t.w, w); n.es = s; ctxSize(n.a, n.ew, s); }
      else self(n.a);
      return;
    case 'cond':
      n.ew = Math.max(n.t.w, w); n.es = s; self(n.c); ctxSize(n.a, n.ew, s); ctxSize(n.b, n.ew, s);
      return;
    case 'cat': for (const p of n.parts) self(p); return;
    case 'repl': self(n.a); return;
    case 'conv': self(n.a); return;
    case 'bit': case 'elem': self(n.index); return;
    case 'c':
      if (n.src) {
        // folded constant: size the original expression and evaluate it again
        ctxSize(n.src, w, s);
        try { n.val = evalE(n.src, constCtx()); } catch { /* keep the self-determined value */ }
      } else if (n.fillBit && w > n.val.w) {
        n.val = V.fromBits(n.fillBit.repeat(w));
      } else if (n.xext && w > n.val.w) {
        // unsized 'bx / 'bz: the x / z fills the context width
        const ext = V.mask(w) ^ V.mask(n.val.w);
        n.val = V.mk(w, n.val.v | (n.xext === 'z' ? ext : 0n), n.val.x | ext, n.val.s);
      }
      return;
  }
}

// ---------------------------------------------------------------- lvalues
export function isLvalueExpr(e) {
  switch (e.op) {
    case 'ref': return true;
    case 'index': case 'slice': case 'pslice': case 'field': return isLvalueExpr(e.base);
    case 'apply': return e.args.length >= 1;
    case 'concat': return e.parts.every(isLvalueExpr);
  }
  return false;
}

export function bindLvalue(E, e, loc) {
  switch (e.op) {
    case 'ref': {
      let entry = E.sc.lookup(e.name);
      if (!entry && E.lang === 'verilog' && (e.path || e.name.includes('.'))) {
        const r = hierResolve(E, e.name, e.path, loc);
        if (r?.node) return r.node;
        entry = r?.entry || null;
      }
      if (!entry) {
        if (E.implicitNets) return bindExpr(E, e, null, loc);
        throw notDeclared(e.name, loc);
      }
      if (entry.kind === 'sig') return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name: e.name };
      if (entry.kind === 'loc') return locNode(E, entry, e.name);
      if (entry.kind === 'alias' && entry.lv) return entry.lv;
      throw new ElabError(`cannot assign to '${e.name}'`, loc);
    }
    case 'index': {
      const base = bindLvalue(E, e.base, loc);
      const index = bindExpr(E, e.index, null, loc);
      const chk = E.lang === 'vhdl' ? { chk: true } : {};
      if (base.t.packed) return packedElem(base, index);
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...chk };
      if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };
      return { k: 'bit', base, index, t: BIT, ...chk };
    }
    case 'slice': {
      const base = bindLvalue(E, e.base, loc);
      const n = sliceNode(E, base, e.left, e.right, loc, e.dir);
      return n;
    }
    case 'pslice': {
      const base = bindLvalue(E, e.base, loc);
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      return { k: 'pslice', base, start: bindExpr(E, e.start, null, loc), dir: e.dir, t: vecT(w) };
    }
    case 'field': return fieldNode(E, bindLvalue(E, e.base, loc), e.name, loc);
    case 'apply': {
      let base = bindLvalue(E, { op: 'ref', name: e.name }, loc);
      const args = positional(e.args);
      // m(i, j) of a multi-dimensional array (an array of arrays): one index per dimension
      for (const a of args.slice(0, -1)) {
        if (base.t.kind !== 'array') throw new ElabError(`'${e.name}' indexed with ${args.length} indices`, loc);
        base = { k: 'elem', base, index: bindExpr(E, a, null, loc), t: base.t.elem };
      }
      const a = args[args.length - 1];
      if (a.op === 'slice' && a.base == null) return sliceNode(E, base, a.left, a.right, loc, a.dir);
      const index = bindExpr(E, a, null, loc);
      const chk = E.lang === 'vhdl' ? { chk: true } : {};
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...chk };
      if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };
      return { k: 'bit', base, index, t: BIT, ...chk };
    }
    case 'concat': {
      const parts = e.parts.map(p => bindLvalue(E, p, loc));
      return { k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) };
    }
  }
  throw new ElabError('invalid assignment target', loc);
}

// VHDL: an assignment to an object of an integer subtype checks the value against its range
function rangeCheck(asg) {
  const t = asg.target.t;
  if (t && t.kind === 'int' && t.rlo !== undefined && (t.rlo > -2147483648 || t.rhi < 2147483647)) asg.rng = [t.rlo, t.rhi];
}

function lroot(L) {
  while (L.base) L = L.base;
  return L;
}

function checkAssignable(E, target, value, loc) {
  if (E.lang !== 'vhdl') return;
  const tw = target.t.w, vw = value.t.w;
  if (target.t.kind === 'logic' && value.t.kind === 'logic' && tw !== vw && !value.t.scalar && !target.t.scalar && value.k !== 'c')
    diag(E, `width mismatch: target is ${tw} bits, value is ${vw} bits`, loc, 'warning');
}

// ---------------------------------------------------------------- statements
export function bindBlock(E, stmts, loc) {
  return { k: 'blk', stmts: stmts.map(s => bindStmt(E, s, loc)).filter(Boolean), loc };
}

function bindStmt(E, s, ploc) {
  const loc = s.loc || ploc;
  try {
    return bindStmt0(E, s, loc);
  } catch (e) {
    if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e;
    if (e.hier && E.deferred && !E.deferred.done && !E.inFunction) throw e;   // (the whole item is elaborated again later)
    diag(E, e.message, e.loc || loc);
    return { k: 'null', loc };
  }
}

function bindStmt0(E, s, loc) {
  switch (s.kind) {
    case 'block': {
      const sc = new Scope(E.sc);
      const BE = { ...E, sc };
      // a named block is a scope: blk.x names its variable x from outside it (Verilog)
      if (s.label && E.lang === 'verilog') E.sc.def(s.label, { kind: 'gen', sc });
      // (its variables are static: other processes and instances read them by their hierarchical
      // name, dut.blk.x, from the process's frame; #12)
      const path = s.label && E.lang === 'verilog' && E.procRef && E.blockPath ? [...E.blockPath, s.label] : null;
      if (path) BE.blockPath = path;
      for (const d of s.decls || []) {
        if (d.kind === 'signal') d.net = 'variable';
        bindDecl(BE, d);
        const ent = path && d.kind === 'signal' ? sc.local(d.name) : null;
        if (ent?.kind === 'loc' && E.inst) (E.inst.blockVars ??= new Map()).set(`${E.prefix}${path.join('.')}.${d.name}`, { ref: E.procRef, i: ent.i, t: ent.t });
      }
      return { k: 'blk', stmts: s.stmts.map(x => bindStmt(BE, x, loc)).filter(Boolean), loc, ...(s.label ? { label: s.label } : {}) };
    }
    case 'fork': {   // Verilog fork: each statement runs as a child thread of the process
      if (!E.fb) throw new ElabError('fork is only allowed in initial / always blocks and tasks', loc);
      const sc = new Scope(E.sc);
      const BE = { ...E, sc };
      for (const d of s.decls || []) bindDecl(BE, d);
      return { k: 'fork', branches: s.stmts.map(x => bindStmt(BE, x, loc)).filter(Boolean), join: s.join || 'all', loc };
    }
    case 'waitfork': return { k: 'waitfork', loc };
    case 'disablefork': return { k: 'disablefork', loc };
    case 'assign': {
      const target = bindLvalue(E, s.target, loc);
      // (others => v) into a slice of run-time bounds: v into each of its elements (#11)
      const fill = target.k === 'daslice' && s.value.op === 'aggregate' && s.value.items.length === 1
        && s.value.items[0].choices?.length === 1 && s.value.items[0].choices[0] === 'others';
      const value = fill ? { k: 'afill', a: bindExpr(E, s.value.items[0].value, target.t.elem, loc), t: target.t } : bindExpr(E, s.value, target.t, loc);
      if (E.lang === 'verilog') ctxSize(value, target.t.w);
      checkAssignable(E, target, value, loc);
      const root = lroot(target.k === 'cat' ? target.parts[0] : target);
      if (E.lang === 'vhdl' && s.nonblocking && root.k === 'loc' && !E.inFunction) diag(E, `'${root.name}' is a variable: use ':='`, loc, 'warning');
      if (E.inFunction && !E.inTask && root.k === 'sig' && !s.nonblocking) diag(E, `function assigns signal '${root.name}'`, loc, 'warning');
      const asg = {
        k: 'asg', target, value, nb: !!s.nonblocking && root.k !== 'loc',
        delay: s.delay ? bindExpr(E, s.delay, null, loc) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, prec: E.timePrec, loc,
      };
      if (E.lang === 'vhdl' && asg.nb) Object.assign(asg, vhdlMech(E, s));
      if (E.lang === 'vhdl') rangeCheck(asg);
      // Verilog `a = #d b;`: the process waits d, then assigns the value sampled before the wait
      if (E.lang === 'verilog' && !asg.nb && asg.delay) asg.intra = true;
      return asg;
    }
    case 'if': return { k: 'if', c: vsize(E, bindExpr(E, s.cond, null, loc)), then: bindStmt(E, s.then, loc), else: s.else ? bindStmt(E, s.else, loc) : null, loc };
    case 'case': {
      const sel = bindExpr(E, s.expr, null, loc);
      const items = s.items.map(it => ({
        choices: it.choices.map(ch => {
          if (ch.range) {
            const r = ch.range;
            if (r.of) { const er = evalRange(E, r); return { range: { lo: cI(er.left), hi: cI(er.right) } }; }
            return { range: { lo: bindExpr(E, r.left, null, loc), hi: bindExpr(E, r.right, null, loc) } };
          }
          const c = bindExpr(E, ch, sel.t, loc);
          return c;
        }),
        body: bindStmt(E, it.body, loc),
      }));
      if (E.lang === 'verilog') {
        // the case expression and the items are sized with each other, signed only when all are
        // (IEEE 1364-2005 9.5)
        const choices = items.flatMap(it => it.choices.filter(c => !c.range));
        const m = Math.max(sel.t.w, ...choices.map(c => c.t.w));
        const ss = !!sel.t.s && choices.every(c => c.t.s);
        ctxSize(sel, m, ss);
        for (const c of choices) ctxSize(c, m, ss);
        return { k: 'case', sel, items, def: s.default ? bindStmt(E, s.default, loc) : null, variant: s.variant || 'case', loc, cw: m, ss };
      }
      return { k: 'case', sel, items, def: s.default ? bindStmt(E, s.default, loc) : null, variant: s.variant || 'case', loc };
    }
    case 'for': return {
      k: 'for', init: bindStmt(E, s.init, loc), cond: vsize(E, bindExpr(E, s.cond, null, loc)), step: bindStmt(E, s.step, loc),
      body: bindStmt(E, s.body, loc), loc,
    };
    case 'forrange': {
      const r = evalRangeDyn(E, s.range, loc);
      const sc = new Scope(E.sc);
      if (!E.fb) throw new ElabError('loop outside of a process', loc);
      const init = r.from.k === 'c' ? fitVal(r.from.val, INT) : V.fromInt(0);
      const i = E.fb.alloc(INT, init);
      sc.def(s.var, { kind: 'loc', i, t: INT, lvl: E.fb.level });
      const LE = { ...E, sc };
      return { k: 'forrange', var: i, varT: INT, from: r.from, to: r.to, down: r.down, body: bindStmt(LE, s.body, loc), loc, label: s.label };
    }
    case 'while': return { k: 'while', cond: vsize(E, bindExpr(E, s.cond, null, loc)), body: bindStmt(E, s.body, loc), loc, label: s.label };
    case 'repeat': return { k: 'repeat', count: vsize(E, bindExpr(E, s.count, null, loc)), body: bindStmt(E, s.body, loc), loc };
    case 'forever': {
      const body = bindStmt(E, s.body, loc);
      // (a VHDL `loop` may iterate without waiting: it ends with exit; only the iteration count is limited)
      return { k: 'forever', body, hasWait: E.lang === 'vhdl' || containsKind(body, ['delay', 'event', 'wait', 'task', 'fork', 'waitfork']), loc, label: s.label };
    }
    case 'exit': case 'next': return { k: s.kind, c: s.cond ? bindExpr(E, s.cond, null, loc) : null, loc, label: s.label };
    // the return type is the expected type of aggregates and of character / enumeration literals
    case 'return': return { k: 'ret', value: s.value ? bindExpr(E, s.value, E.retT && !E.retT.unconstrained && (s.value.op === 'aggregate' || E.retT.char || E.retT.kind === 'enum') ? E.retT : null, loc) : null, loc };
    case 'null': return { k: 'null', loc };
    case 'delay': return { k: 'delay', amount: bindExpr(E, s.amount, null, loc), unit: E.timeUnit, prec: E.timePrec, stmt: s.stmt ? bindStmt(E, s.stmt, loc) : null, loc };
    case 'disable': return { k: 'disable', label: s.label, loc };
    case 'event': {
      const stmt = s.stmt ? bindStmt(E, s.stmt, loc) : null;
      const triggers = s.events === 'all' ? triggersOfReads(stmt) : s.events.flatMap(ev => bindTrigger(E, ev.expr, ev.edge, loc));
      return { k: 'event', triggers, stmt, loc };
    }
    case 'wait': {
      const until = s.until ? vsize(E, bindExpr(E, s.until, null, loc)) : null;
      let triggers = [];
      if (s.on) triggers = s.on.flatMap(x => bindTrigger(E, x, 'any', loc));
      else if (until) triggers = triggersOfReads(until);
      if (until && !s.on && !triggers.length && !s.for) diag(E, 'wait until condition does not depend on any signal', loc, 'warning');
      return { k: 'wait', until, triggers, forT: s.for ? bindExpr(E, s.for, null, loc) : null, level: !!s.level, loc };
    }
    case 'call': return bindCallStmt(E, s, loc);
    case 'report': return { k: 'report', msg: bindExpr(E, s.message, null, loc), sev: s.severity || 'note', loc };
    case 'assert': return {
      k: 'assert', c: bindExpr(E, s.cond, null, loc), msg: s.message ? bindExpr(E, s.message, null, loc) : null,
      sev: s.severity || 'error', loc,
    };
  }
  throw new ElabError(`unsupported statement '${s.kind}'`, loc);
}

export const cI = n => ({ k: 'c', val: V.fromInt(n), t: INT });
// Verilog: a self-determined expression (condition, count) is sized with its own width
const vsize = (E, n) => { if (E.lang === 'verilog') ctxSize(n, n.t.w); return n; };

// VHDL signal assignment: driver semantics (inertial / transport / reject, waveform elements).
function vhdlMech(E, s) {
  const m = { vh: true, mech: s.mech === 'transport' ? 'transport' : 'inertial' };
  if (s.mech && s.mech.reject) m.reject = bindExpr(E, s.mech.reject, null, s.loc);
  if (s.waveCont) m.cont = true;
  return m;
}

function evalRangeDyn(E, r, loc) {
  if (r.of) {
    const er = evalRange(E, r);
    return { from: cI(er.left), to: cI(er.right), down: er.desc };
  }
  const from = bindExpr(E, r.left, null, loc), to = bindExpr(E, r.right, null, loc);
  let down = r.dir === 'downto';
  if (!r.dir && from.k === 'c' && to.k === 'c') down = V.toNum(from.val) > V.toNum(to.val);
  return { from, to, down };
}

// True if a Verilog name (dotted or not) starts with a scope: the module itself or a module above
// it, an instance in this module, or a named / generate block of it ($dumpvars arguments)
function isScopeName(E, name) {
  const first = String(name).split('.')[0].replace(/\[.*\]$/, '');
  for (let i = E.inst; i; i = i.parent) if (i.module === first || i.name === first) return true;
  if (E.sc.lookup(first)?.kind === 'gen' || E.sc.lookup(first)?.kind === 'genarr') return true;
  const insts = new Set();
  const visit = items => { for (const it of items || []) { if (it.kind === 'instance') insts.add(it.name); visit(it.items); visit(it.then); visit(it.else); } };
  visit(E.inst?.mod?.items);
  return insts.has(first);
}

function bindCallStmt(E, s, loc) {
  if (E.lang === 'verilog' && (s.path || s.name.includes('.')) && !E.sc.lookup(s.name)) {
    // a task of another scope: top.t(x), blk.t(x)
    const r = hierResolve(E, s.name, s.path, loc);
    if (r?.entry?.kind === 'func') {
      const alias = `\u0000${s.name}`;
      const sc = new Scope(E.sc);
      sc.def(alias, r.entry);
      return bindCallStmt({ ...E, sc }, { ...s, name: alias, path: null }, loc);
    }
    throw notDeclared(s.name, loc);
  }
  const sub = E.sc.lookup(s.name);
  if (sub?.kind === 'subalias') return bindCallStmt(E, { ...s, name: sub.target }, loc);
  const name = s.name;
  const sysName = name[0] === '$' ? name : (['finish', 'stop'].includes(name.toLowerCase()) ? name.toLowerCase() : null);
  if (sysName && !(name[0] !== '$' && E.sc.lookup(name))) {
    // $dumpvars(levels, tb_top, dut, …): an argument may name a scope (the module, an instance, a
    // named or generate block) rather than a value (#12); the VCD tasks only note it
    const scopeArgs = /^\$(dumpvars|dumpports|printtimescale)$/.test(sysName);
    const args = s.args.map(a => {
      if (a.op === 'str') return { k: 'str', value: a.value, t: STR };
      if (scopeArgs && a.op === 'ref') {
        try { return bindExpr(E, a, null, loc); } catch (e) {
          if (!(e instanceof ElabError) || !isScopeName(E, a.name)) throw e;
          return { k: 'str', value: a.name, t: STR, scope: true };
        }
      }
      return bindExpr(E, a, null, loc);
    });
    if (/^\$(monitor|display[bho]?|write[bho]?|strobe|fdisplay|fwrite|fstrobe|sformat|swrite)$/.test(sysName)) args.forEach(a => { if (a.k !== 'str' && E.lang === 'verilog') ctxSize(a, a.t.w); });
    if ((sysName === '$readmemh' || sysName === '$readmemb') && args[1]) {
      const L = bindLvalue(E, s.args[1], loc);
      return { k: 'sys', name: sysName, args: [args[0], L], loc };
    }
    return { k: 'sys', name: sysName, args, loc };
  }
  let entry = E.sc.lookup(name);
  if (entry && entry.kind === 'func') entry = pickOverload(E, entry, s.args, loc);
  if (!entry || entry.kind !== 'func') {
    if (E.lang === 'vhdl' && TEXTIO_PROCS.has(name)) return bindTextio(E, name, s.args, loc);
    if (E.lang === 'vhdl' && ['file_open', 'file_close'].includes(name)) {
      diag(E, `procedure '${name}' (textio) is not supported`, loc, 'warning');
      return { k: 'null', loc };
    }
    throw new ElabError(`task/procedure '${name}' is not declared`, loc);
  }
  const decl = entry.decl;
  // one actual per formal, in order: named association (f => a) and default values (VHDL)
  const acts = new Array(Math.max(decl.params.length, s.args.length)).fill(null);
  s.args.forEach((a, k) => {
    if (a && a.named !== undefined) {
      const i = decl.params.findIndex(p => p.name === a.named);
      if (i < 0) throw new ElabError(`'${name}' has no parameter '${a.named}'`, loc);
      acts[i] = a.value;
    } else acts[k] = a;
  });
  decl.params.forEach((p, k) => {
    if (!acts[k] && p.default && p.dir !== 'out') acts[k] = p.default;
    if (!acts[k]) throw new ElabError(`missing argument '${p.name}' in call to '${name}'`, loc);
  });
  s = { ...s, args: acts };
  const args = s.args.map((a, k) => {
    const p = decl.params[k];
    if (!p) throw new ElabError(`too many arguments for '${name}'`, loc);
    if (p.dir === 'out') return null;
    return bindExpr(E, a, null, loc);
  });
  // VHDL `signal` parameters refer to the actual signal (assignments inside the procedure drive
  // it at once, across waits), instead of being copied in and out
  const hasLoc = n => { let found = false; walk(n, x => { if (x.k === 'loc') found = true; }); return found; };
  let sigActuals = null;
  if (E.lang === 'vhdl') {
    s.args.forEach((a, k) => {
      const p = decl.params[k];
      if (!p || String(p.class || '').toLowerCase() !== 'signal') return;
      const actual = a;
      const rv = bindExpr(E, actual, null, loc);
      const lv = p.dir !== 'in' ? bindLvalue(E, actual, loc) : null;
      if (hasLoc(rv) || (lv && hasLoc(lv))) return;     // actual uses process variables: copy semantics
      (sigActuals ||= [])[k] = { rv, lv };
    });
  }
  const fn = boundFunction(entry, s.args.map((a, k) => args[k] || bindLvalue(E, a, loc)), loc, sigActuals);
  const outTargets = s.args.map((a, k) => (decl.params[k] && decl.params[k].dir !== 'in' && !sigActuals?.[k] ? bindLvalue(E, a, loc) : null));
  if (sigActuals) args.forEach((_, k) => { if (sigActuals[k]) args[k] = null; });
  const node = { k: 'task', fn, args, outTargets, loc };
  // signals passed to `signal` parameters of mode in / inout are read by the call
  if (sigActuals) node.sigReads = sigActuals.flatMap((a, k) => (a && decl.params[k].dir !== 'out' ? [a.rv] : []));
  return node;
}

function bindTrigger(E, expr, edge, loc) {
  const n = bindExpr(E, expr, null, loc);
  if (n.k === 'sig') return [{ sig: n.sig, edge, pos: null }];   // pos null: the whole signal
  if (n.k === 'bit' && n.base.k === 'sig' && n.index.k === 'c') return [{ sig: n.base.sig, edge, pos: bitpos(n.base.t, V.toNum(n.index.val)) }];
  const reads = readsOf(n);
  if (edge !== 'any') diag(E, 'edge on a complex expression: treated as any change', loc, 'warning');
  return [...reads].map(sig => ({ sig, edge: 'any', pos: null }));
}

// ---------------------------------------------------------------- read/write analysis
export function walk(n, f) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) walk(x, f); return; }
  if (f(n) === false) return;
  for (const key in n) {
    if (key === 'sig' || key === 't' || key === 'fn' || key === 'val' || key === 'loc' || key === 'triggers') continue;
    const v = n[key];
    if (v && typeof v === 'object') walk(v, f);
  }
}

export function readsOf(n) {
  const reads = new Set();
  walk(n, x => {
    if ((x.k === 'sig' || x.k === 'edge' || x.k === 'event') && x.sig) reads.add(x.sig);
    if (x.k === 'call' && x.fn && !x.fn._visiting) {   // (guard: recursive functions)
      x.fn._visiting = true;
      try { for (const s of x.fn.reads || collectRW(x.fn.body || { k: 'null' }).reads) reads.add(s); } finally { x.fn._visiting = false; }
    }
  });
  return reads;
}

function writesOfL(L) {
  const w = new Set();
  const root = L => {
    if (L.k === 'cat') { L.parts.forEach(root); return; }
    while (L.base) L = L.base;
    if (L.k === 'sig') w.add(L.sig);
  };
  root(L);
  return w;
}

export function collectRW(body) {
  const reads = new Set(), writes = new Set();
  const visitL = L => {
    if (L.k === 'cat') { L.parts.forEach(visitL); return; }
    let x = L;
    while (x.base) {
      for (const key of ['index', 'left', 'right', 'start']) if (x[key]) for (const s of readsOf(x[key])) reads.add(s);
      x = x.base;
    }
    if (x.k === 'sig') writes.add(x.sig);
  };
  walk(body, x => {
    if (x.k === 'asg') {
      visitL(x.target);
      for (const s of readsOf(x.value)) reads.add(s);
      if (x.delay) for (const s of readsOf(x.delay)) reads.add(s);
      return false;
    }
    if (x.k === 'task') {
      x.args.forEach(a => { if (a) for (const s of readsOf(a)) reads.add(s); });
      x.sigReads?.forEach(a => { for (const s of readsOf(a)) reads.add(s); });
      x.outTargets.forEach(L => { if (L) visitL(L); });
      // signals the procedure assigns itself (signal parameters, outer signals)
      if (x.fn && x.fn.body && !x.fn._visiting) {
        x.fn._visiting = true;
        for (const s of collectRW(x.fn.body).writes) writes.add(s);
        x.fn._visiting = false;
      }
      return false;
    }
    if (x.k === 'sys' && (x.name === '$readmemh' || x.name === '$readmemb') && x.args[1]) { visitL(x.args[1]); return false; }
    if ((x.k === 'sig' || x.k === 'edge' || x.k === 'event') && x.sig) reads.add(x.sig);
    if (x.k === 'call' && x.fn && x.fn.body && !x.fn._visiting) {
      x.fn._visiting = true;
      const rw = collectRW(x.fn.body);
      x.fn._visiting = false;
      for (const s of rw.reads) reads.add(s);
    }
  });
  return { reads, writes };
}

function triggersOfReads(n) {
  if (!n) return [];
  return [...collectRW(n).reads].map(sig => ({ sig, edge: 'any', pos: null }));
}

export function containsKind(n, kinds) {
  let found = false;
  walk(n, x => { if (kinds.includes(x.k)) found = true; return !found; });
  return found;
}

// ---------------------------------------------------------------- misc
export function exprText(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar ? `'${e.bits}'` : (e.bits.length <= 8 ? `"${e.bits}"` : `0x${BigInt('0b' + e.bits.replace(/[xz]/g, '0')).toString(16)}`);
    case 'int': return e.value;
    case 'real': return String(e.value);
    case 'phys': return `${e.value} ${e.unit}`;
    case 'str': return JSON.stringify(e.value);
    case 'ref': return e.name;
    case 'index': return `${exprText(e.base)}[${exprText(e.index)}]`;
    case 'slice': return `${exprText(e.base)}[${exprText(e.left)}:${exprText(e.right)}]`;
    case 'pslice': return `${exprText(e.base)}[${exprText(e.start)}${e.dir}:${exprText(e.width)}]`;
    case 'apply': return `${e.name}(${e.args.map(a => exprText(a.named !== undefined ? a.value : a)).join(', ')})`;
    case 'call': return `${e.name}(${e.args.map(exprText).join(', ')})`;
    case 'concat': return `{${e.parts.map(exprText).join(', ')}}`;
    case 'repl': return `{${exprText(e.count)}{${exprText(e.value)}}}`;
    case 'unary': return `${e.o}${exprText(e.a)}`;
    case 'binary': return `${exprText(e.a)} ${e.o} ${exprText(e.b)}`;
    case 'cond': return `${exprText(e.cond)} ? ${exprText(e.then)} : ${exprText(e.else)}`;
    case 'attr': return `${exprText(e.prefix)}'${e.attr}`;
    case 'aggregate': return `(${e.items.map(i => (i.choices ? i.choices.map(c => (c === 'others' ? 'others' : c.range ? '..' : exprText(c))).join('|') + ' => ' : '') + exprText(i.value)).join(', ')})`;
    case 'qualified': return `${e.type}'(${exprText(e.expr)})`;
    case 'fill': return `'${e.bit}`;
  }
  return '?';
}
