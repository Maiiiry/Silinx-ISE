// Silinx (#1530): HDL to C. A design (VHDL or Verilog, or a drawing's generated HDL: an ASM chart, a state diagram, a
// truth table), elaborated (core/elaborate.js), as a C model computing what Silinx's simulator computes (core/interp.js),
// two-state: a struct of its signals (each of at most 64 bits, an array of words), the processes as C, and
//   void <top>_init(<top>_t *s)   its signals at their initial values (what the elaborator gives, unknown bits 0)
//   void <top>_eval(<top>_t *s)   its combinational logic settled, the inputs set first (delta cycles: the processes
//                                 run on the values of the last one, their signal assignments the next one's)
//   void <top>_step(<top>_t *s)   a sequential design's rising edge of its clock (its clocked processes on the values
//                                 before it, their assignments after), then _eval
// A process is clocked when it waits for an edge of its clock (one clock, rising edges); what cannot be modelled is
// said (a falling edge, a wait with a time, a function call, file I/O, values of more than 64 bits), not guessed.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   hdlToC(design, { name }) -> { ok, text, top, clock, inputs: [{ name, w }], outputs: [{ name, w }], errors }
import { mountExprs } from './hdl-c-expr.js';
import { mountStmts } from './hdl-c-stmt.js';

export class CModelError extends Error {}

const ctype = (w) => (w <= 8 ? 'uint8_t' : w <= 16 ? 'uint16_t' : w <= 32 ? 'uint32_t' : 'uint64_t');
const hex = (v, w) => `0x${BigInt.asUintN(Math.max(1, w), BigInt(v ?? 0n)).toString(16)}ULL`;
const RT = `static inline uint64_t ap_m(uint64_t x, int w) { return w >= 64 ? x : x & ((1ULL << w) - 1); }
/* x of 'from' bits extended to 'to' bits: with its sign bit when s */
static inline uint64_t ap_x(uint64_t x, int from, int to, int s) {
  x = ap_m(x, from);
  if (s && from > 0 && from < 64 && ((x >> (from - 1)) & 1)) x |= ~0ULL << from;
  return ap_m(x, to);
}
static inline int64_t ap_s(uint64_t x, int w) { return (int64_t)ap_x(x, w, 64, 1); }
static inline uint64_t ap_shl(uint64_t x, uint64_t n, int w) { return n >= (uint64_t)w ? 0 : ap_m(x << n, w); }
static inline uint64_t ap_shr(uint64_t x, uint64_t n, int w, int s) {
  if (n >= (uint64_t)w) return s && ((x >> (w - 1)) & 1) ? ap_m(~0ULL, w) : 0;
  return s ? ap_m((uint64_t)(ap_s(x, w) >> n), w) : ap_m(x, w) >> n;
}
/* the bits between positions p1 and p2 (either order), at w bits */
static inline uint64_t ap_dsl(uint64_t x, int64_t p1, int64_t p2, int w) {
  int64_t lo = p1 < p2 ? p1 : p2, n = (p1 < p2 ? p2 - p1 : p1 - p2) + 1;
  if (lo < 0 || lo >= 64) return 0;
  return ap_m(ap_m(x >> lo, n >= 64 ? 64 : (int)n), w);
}
/* a VHDL shift (o: 0 sll, 1 srl, 2 sla-like <<<, 3 >>>, 4 rol, 5 ror) by k, below 0 the other way */
static inline uint64_t ap_vsh(int o, uint64_t a, int64_t k, int w) {
  if (k < 0) { k = -k; o ^= 1; }
  if (o >= 4) { k %= w; if (!k) return ap_m(a, w); return o == 4 ? ap_m((a << k) | (ap_m(a, w) >> (w - k)), w) : ap_m((ap_m(a, w) >> k) | (a << (w - k)), w); }
  if (k > w) k = w;
  return o == 0 || o == 2 ? ap_shl(a, (uint64_t)k, w) : ap_shr(a, (uint64_t)k, w, o == 3);
}
static inline uint64_t ap_par(uint64_t x) { x ^= x >> 32; x ^= x >> 16; x ^= x >> 8; x ^= x >> 4; x ^= x >> 2; x ^= x >> 1; return x & 1; }
`;

export function hdlToC(design, { name = design.top.name } = {}) {
  const top = design.top;
  const fail = (msg, n) => { throw new CModelError(`${msg}${n?.loc?.line ? ` (line ${n.loc.line}${n.file ? `, ${n.file}` : ''})` : ''}`); };
  const id = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  // ---------------- the signals: a field each
  const field = new Map(), used = new Set();
  const uniq = (n) => { let k = id(n), i = 1; while (used.has(k)) k = `${id(n)}_${i++}`; used.add(k); return k; };
  for (const p of top.ports) field.set(p.sig, uniq(p.name));
  const prefix = `${top.path}.`;
  for (const s of design.signals) if (!field.has(s)) field.set(s, uniq(s.path.startsWith(prefix) ? s.path.slice(prefix.length) : s.path));
  const isArr = (s) => s.t.kind === 'array';
  for (const s of design.signals) {
    const w = isArr(s) ? s.t.elem?.w : s.t.w;
    if (w > 64) fail(`'${s.name}' has ${w} bits: a C model's values have at most 64`);
    if (isArr(s) && s.t.elem?.kind === 'array') fail(`'${s.name}': an array of arrays cannot be modelled yet`);
  }
  // ---------------- the clock: the one signal whose edges the clocked processes wait for
  let clock = null;
  const walk = (x, f, depth = 0) => {
    if (!x || typeof x !== 'object' || depth > 400) return;
    if (Array.isArray(x)) { for (const y of x) walk(y, f, depth + 1); return; }
    f(x);
    for (const [k, v] of Object.entries(x)) if (!['t', 'loc', 'sig', 'inst', 'fn', 'ref', 'val', 'src'].includes(k) && v && typeof v === 'object') walk(v, f, depth + 1);
  };
  const clockedProc = (p) => {
    let c = false;
    for (const t of p.triggers || []) if (t.edge === 'pos' || t.edge === 'neg') c = true;
    walk(p.body, (x) => { if (x.k === 'edge' || x.k === 'event') c = true; });
    return c;
  };
  const procs = design.procs.filter((p) => p.mode !== 'initial' && p.kind !== 'initial');
  for (const p of procs) {
    if (!clockedProc(p)) continue;
    const edges = [];
    walk(p.body, (x) => { if (x.k === 'edge') edges.push({ sig: x.sig, pos: x.pos }); if (x.k === 'event') edges.push({ sig: x.sig, pos: true }); });
    if (!edges.length) {
      const t = (p.triggers || []).filter((x) => x.edge === 'pos' || x.edge === 'neg');
      // (Verilog: the first edge of its list is the clock; the others, an asynchronous reset's, tested in its body)
      const cl = t.find((x) => !walkHas(p.body, x.sig)) || t[0];
      edges.push({ sig: cl.sig, pos: cl.edge === 'pos' });
    }
    for (const e of edges) {
      if (!e.pos) fail(`a falling edge of '${e.sig.name}': only rising edges are modelled`, p);
      if (clock && clock !== e.sig) fail(`two clocks, '${clock.name}' and '${e.sig.name}': a C model of one clock only`, p);
      clock = e.sig;
    }
  }
  function walkHas(body, sig) { let h = false; walk(body, (x) => { if (x.k === 'sig' && x.sig === sig) h = true; }); return h; }

  // ---------------- expressions (core/hdl-c-expr.js), statements and functions (core/hdl-c-stmt.js)
  const G = { field, isArr, fail, hex, id, name, clock: () => clock, fnOf: (...a) => G.fnOf2(...a) };
  Object.assign(G, mountExprs(G));
  const st = mountStmts(G);
  G.fnOf2 = st.fnOf;
  const { S, fnTexts } = st;

  // ---------------- the processes, as functions
  const locals = [];   // [{ name, w, init }]: the processes' variables, fields of the struct
  const funcs = [];
  procs.forEach((p, k) => {
    if (!p.body) return;
    const fr = p.frameInit ? p.frameInit() : [];
    const locName = (i) => `p${k}_v${i}`;
    const seen = new Set();
    const ctx = {
      clockedPhase: clockedProc(p),
      local: (n) => { if (n.up != null) fail('a variable of an enclosing subprogram', n); return mk(n.i, n.t); },
      var: (i, t) => mk(i, t),
    };
    function mk(i, t) {
      const nm = locName(i);
      if (!seen.has(i)) { seen.add(i); locals.push({ name: nm, w: t?.w || 64, init: fr[i]?.v ?? 0n }); }
      return `s->${nm}`;
    }
    st.take();
    S(p.body, ctx, '  ');
    funcs.push({ name: `ap_p${k}`, clocked: ctx.clockedPhase, body: st.take(), line: p.loc?.line, file: p.file, label: p.name });
  });

  // ---------------- the text
  const T = `${id(name)}_t`, F = id(name);
  const out = [`/* Generated by Silinx: a C model of '${top.name}' (${top.file || ''}), computing what Silinx's simulator computes`,
    ` * (two-state: unknown bits are 0). ${F}_init, then each cycle: set the inputs, ${clock ? `${F}_step (a rising edge of ${field.get(clock)})` : `${F}_eval`}, read the outputs. */`,
    '#include <stdint.h>', '#include <string.h>', '', RT, `typedef struct {`];
  for (const p of top.ports) out.push(`  ${ctype(p.sig.t.w)} ${field.get(p.sig)};   /* ${p.dir} ${p.sig.t.w} bit${p.sig.t.w > 1 ? 's' : ''} */`);
  for (const s of design.signals) {
    if (top.ports.some((p) => p.sig === s)) continue;
    out.push(isArr(s) ? `  ${ctype(s.t.elem.w)} ${field.get(s)}[${s.t.len}];` : `  ${ctype(s.t.w)} ${field.get(s)};`);
  }
  for (const l of locals) out.push(`  ${ctype(l.w)} ${l.name};`);
  out.push(`} ${T};`, '');
  out.push(...fnTexts);
  for (const f of funcs) {
    out.push(`/* ${f.label}${f.line ? `, line ${f.line}` : ''}${f.clocked ? ': clocked' : ''} */`, `static void ${f.name}(${T} *s, ${T} *nx) {`, ...f.body, '}', '');
  }
  const init = [];
  const val = (v, w) => hex(v?.x ? BigInt(v.v ?? 0n) & ~BigInt(v.x) : v?.v ?? 0n, w);
  for (const s of design.signals) {
    if (isArr(s)) { (Array.isArray(s.val) ? s.val : []).forEach((e, k) => init.push(`  s->${field.get(s)}[${k}] = ${val(e, s.t.elem.w)};`)); continue; }
    init.push(`  s->${field.get(s)} = ${val(s.val, s.t.w)};`);
  }
  for (const l of locals) init.push(`  s->${l.name} = ${hex(l.init, l.w)};`);
  out.push(`void ${F}_init(${T} *s) {`, '  memset(s, 0, sizeof *s);', ...init, '}', '');
  const comb = funcs.filter((f) => !f.clocked), seq = funcs.filter((f) => f.clocked);
  out.push(`/* the combinational logic settled: delta cycles until nothing changes */`, `void ${F}_eval(${T} *s) {`,
    '  for (int ap_d = 0; ap_d < 1000; ap_d++) {', `    ${T} ap_old = *s, ap_nx = *s;`, ...comb.map((f) => `    ${f.name}(s, &ap_nx);`),
    '    *s = ap_nx;', '    if (!memcmp(&ap_old, s, sizeof *s)) return;', '  }', '}', '');
  if (clock) {
    out.push(`/* a rising edge of ${field.get(clock)}: the clocked processes on the values before it, their assignments after */`, `void ${F}_step(${T} *s) {`,
      `  ${F}_eval(s);`, `  ${T} ap_nx = *s;`, ...seq.map((f) => `  ${f.name}(s, &ap_nx);`), '  *s = ap_nx;', `  ${F}_eval(s);`, '}', '');
  }
  return {
    ok: true, text: out.join('\n'), top: F, clock: clock ? field.get(clock) : null,
    inputs: top.ports.filter((p) => p.dir === 'in').map((p) => ({ name: field.get(p.sig), w: p.sig.t.w, s: !!p.sig.t.s })),
    outputs: top.ports.filter((p) => p.dir !== 'in').map((p) => ({ name: field.get(p.sig), w: p.sig.t.w, s: !!p.sig.t.s })),
    errors: [],
  };
}


/** hdlToC with its errors as messages, not thrown. */
export function hdlToCSafe(design, opts) {
  try { return hdlToC(design, opts); } catch (e) { if (e instanceof CModelError) return { ok: false, text: '', errors: [e.message] }; throw e; }
}
