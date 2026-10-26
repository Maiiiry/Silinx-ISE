// #1555: the schematic comparator COMP with several comparisons at once (EQ NE LT LE GT GE), an output pin each: its
// comparisons and pins, the generated VHDL and Verilog compiled, elaborated and simulated for every input pair of a
// 3-bit comparator against an independent reference (one, several and all six comparisons, unsigned and signed, bus
// and per-bit operands), a comparator saved before (one comparison, output O) unchanged, its re-pinning (the wires
// following the pins that stay, those of a removed pin dropped), the ISE export's name and the Symbol Info texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import {
  COMPARE_OPS, compareOps, comparePin, newDoc, normalizeDoc, netlist, generateHdl, symbolDef, symbolPins, repinSymbol, followPins, otherPins,
} from '../core/schdoc.js';
import { exportIseSch, decodeXlSymbol } from '../core/isesch-export.js';
import { importIseSch } from '../core/isesch.js';
import { symbolDoc } from '../core/symdocs.js';
import { commonProps } from '../core/schmulti.js';

// ------------------------------------------------------------------ the reference: plain integer comparisons
const W = 3, N = 1 << W;
const val = (x, signed) => (signed && x >= N / 2 ? x - N : x);
const REF = { eq: (a, b) => a === b, ne: (a, b) => a !== b, lt: (a, b) => a < b, le: (a, b) => a <= b, gt: (a, b) => a > b, ge: (a, b) => a >= b };

// a comparator of each shape, its every pin an I/O marker named <inst>_<pin>
function sheet(lang, cases) {
  const doc = newDoc('cmp', lang);
  cases.forEach((params, k) => {
    const s = { id: `S${k + 1}`, type: 'compare', x: 200, y: 40 + k * 220, rot: 0, mirror: false, name: `U${k + 1}`, params: { width: W, ...params } };
    doc.symbols.push(s);
    for (const q of symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]))
      doc.ports.push({ id: `P${doc.ports.length + 1}`, name: `${s.name}_${q.name}`, dir: q.dir === 'out' ? 'out' : 'in', width: q.width || 1, x: q.x, y: q.y });
  });
  return normalizeDoc(doc);
}
const lit = (v, w, lang) => { const b = v.toString(2).padStart(w, '0'); return lang === 'vhdl' ? (w > 1 ? `"${b}"` : `'${b}'`) : `${w}'b${b}`; };
// a test bench driving every input pair (a, b) of every comparator, checking every output against REF
function bench(lang, doc, cases) {
  const ports = doc.ports, L = [];
  const drive = [], checks = [];
  cases.forEach((p, k) => {
    const u = `U${k + 1}`, per = !!p.bits;
    drive.push((a, b) => (per ? [...Array(W).keys()].flatMap(i => [[`${u}_A${i}`, (a >> i) & 1, 1], [`${u}_B${i}`, (b >> i) & 1, 1]]) : [[`${u}_A`, a, W], [`${u}_B`, b, W]]));
    const ops = compareOps(p);
    checks.push((a, b) => ops.map(op => [`${u}_${comparePin(p, op)}`, REF[op](val(a, p.signed), val(b, p.signed)) ? 1 : 0]));
  });
  const decl = q => (lang === 'vhdl' ? (q.width > 1 ? `std_logic_vector(${q.width - 1} downto 0)` : 'std_logic') : (q.width > 1 ? `[${q.width - 1}:0] ` : ''));
  const set = (n, v, w) => (lang === 'vhdl' ? `    ${n} <= ${lit(v, w, lang)};` : `    ${n} = ${lit(v, w, lang)};`);
  const chk = (n, v, i) => (lang === 'vhdl' ? `    if ${n} /= '${v}' then errs := errs + 1; report "v${i} ${n}" severity warning; end if;` : `    if (${n} !== 1'b${v}) begin errs = errs + 1; $display("v${i} ${n}"); end`);
  if (lang === 'vhdl') {
    L.push('library ieee; use ieee.std_logic_1164.all;', 'entity tb is end;', 'architecture s of tb is');
    for (const q of ports) L.push(`  signal ${q.name} : ${decl(q)};`);
    L.push('begin', `  dut : entity work.cmp port map (${ports.map(q => `${q.name} => ${q.name}`).join(', ')});`, '  process', '    variable errs : integer := 0;', '  begin');
  } else {
    L.push('`timescale 1ns/1ps', 'module tb;', '  integer errs = 0;');
    for (const q of ports) L.push(`  ${q.dir === 'in' ? 'reg' : 'wire'} ${decl(q)}${q.name};`);
    L.push(`  cmp dut (${ports.map(q => `.${q.name}(${q.name})`).join(', ')});`, '  initial begin');
  }
  let i = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++, i++) {
    for (const d of drive) for (const [n, v, w] of d(a, b)) L.push(set(n, v, w));
    L.push(lang === 'vhdl' ? '    wait for 1 ns;' : '    #1;');
    for (const c of checks) for (const [n, v] of c(a, b)) L.push(chk(n, v, i));
  }
  if (lang === 'vhdl') L.push('    report "errs=" & integer\'image(errs);', '    wait;', '  end process;', 'end;');
  else L.push('    $display("errs=%0d", errs);', '  end', 'endmodule');
  return L.join('\n');
}
function check(cases) {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet(lang, cases);
    assert.deepEqual(netlist(doc).diagnostics, [], 'Check Schematic: no warnings');
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, [], 'HDL generation: no warnings');
    const r = simulate([{ path: g.filename, text: g.code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: bench(lang, doc, cases) }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], `${lang} compile\n${g.code}`);
    assert.deepEqual(r.warnings ?? [], [], `${lang}: no warnings`);
    const log = r.sim.log.map(l => l.text);
    assert.ok(log.includes('errs=0'), `${lang}\n${log.slice(0, 20).join('\n')}\n${g.code}`);
    assert.equal(log.filter(l => /^v\d+ /.test(l)).length, 0);
  }
}

test('#1555 the comparisons: in pin order, one at least; their pins, O for one, EQ … GE for several', () => {
  assert.deepEqual(COMPARE_OPS, ['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
  assert.deepEqual([compareOps({ op: 'gt' }), compareOps({ op: 'gt,lt' }), compareOps({ op: 'GE, eq' }), compareOps({}), compareOps({ op: 'nope' }), compareOps({ op: '' })],
    [['gt'], ['lt', 'gt'], ['eq', 'ge'], ['eq'], ['eq'], ['eq']]);
  assert.deepEqual([comparePin({ op: 'lt' }, 'lt'), comparePin({ op: 'lt,gt' }, 'lt'), comparePin({ op: 'lt,gt' }, 'gt')], ['O', 'LT', 'GT']);
  const pins = params => symbolDef({ type: 'compare', params: { width: W, ...params } }).pins.map(p => `${p.name}:${p.dir}${p.width}`);
  assert.deepEqual(pins({ op: 'le' }), ['A:in3', 'B:in3', 'O:out1']);
  assert.deepEqual(pins({ op: 'gt,lt' }), ['A:in3', 'B:in3', 'LT:out1', 'GT:out1']);
  assert.deepEqual(pins({ op: COMPARE_OPS.join(',') }), ['A:in3', 'B:in3', 'EQ:out1', 'NE:out1', 'LT:out1', 'LE:out1', 'GT:out1', 'GE:out1']);
  assert.deepEqual(pins({ op: 'eq,ge', bits: true }), ['A0:in1', 'A1:in1', 'A2:in1', 'B0:in1', 'B1:in1', 'B2:in1', 'EQ:out1', 'GE:out1']);
  // (one: the drawing as before, the relation in its body; several: a box named COMP3, its pins apart)
  const one = symbolDef({ type: 'compare', params: { width: W, op: 'le' } });
  assert.deepEqual([one.shape, one.op, one.w, one.h], ['arith', '≤', 80, 40]);
  const all = symbolDef({ type: 'compare', params: { width: W, op: COMPARE_OPS.join(',') } });
  assert.deepEqual([all.shape, all.title], ['lib', 'COMP3']);
  assert.equal(new Set(all.pins.map(q => `${q.x},${q.y}`)).size, all.pins.length, 'distinct pin positions');
  assert.equal(symbolDef({ type: 'compare', params: { width: 4, op: 'ge', bits: true } }).title, 'COMP4 ≥');
});

test('#1555 one comparison (each of the six), as saved before: VHDL and Verilog simulated, every input pair, against the reference', () => {
  check(COMPARE_OPS.map((op, i) => ({ op, signed: i % 2 === 1 })));
});

test('#1555 several comparisons: VHDL and Verilog simulated, every input pair of a 3-bit comparator, against the reference', () => {
  check([{ op: 'lt,gt' }, { op: 'eq,ne,ge', signed: true }, { op: 'le,gt', bits: true }, { op: 'eq,lt', signed: true, bits: true }]);
});

test('#1555 all six comparisons: unsigned and signed, bus and per-bit operands, simulated against the reference', () => {
  const op = COMPARE_OPS.join(',');
  check([{ op }, { op, signed: true }, { op, bits: true }, { op, signed: true, bits: true }]);
});

test('#1555 a comparator saved before (one comparison, output O) loads unchanged: its pin, wiring and HDL', () => {
  // (the comparator, a wire from O to the I/O marker y, the operands on markers a and b)
  const saved = {
    name: 'old', lang: 'vhdl', ports: [{ id: 'P1', name: 'a', dir: 'in', width: 4, x: 160, y: 110 }, { id: 'P2', name: 'b', dir: 'in', width: 4, x: 160, y: 130 },
      { id: 'P3', name: 'y', dir: 'out', width: 1, x: 360, y: 120 }],
    symbols: [{ id: 'S1', type: 'compare', name: 'U1', x: 200, y: 100, rot: 0, mirror: false, params: { width: 4, op: 'gt', signed: false, bits: false } }],
    wires: [{ id: 'W1', points: [{ x: 160, y: 110 }, { x: 200, y: 110 }], bus: true }, { id: 'W2', points: [{ x: 160, y: 130 }, { x: 200, y: 130 }], bus: true },
      { id: 'W3', points: [{ x: 280, y: 120 }, { x: 360, y: 120 }] }], labels: [],
  };
  const doc = normalizeDoc(structuredClone(saved));
  assert.equal(doc.symbols[0].params.op, 'gt');
  assert.deepEqual(compareOps(doc.symbols[0].params), ['gt']);
  assert.deepEqual(symbolPins(doc.symbols[0]).map(q => `${q.name}@${q.x},${q.y}`), ['A@200,110', 'B@200,130', 'O@280,120']);
  assert.deepEqual(doc.wires.map(w => w.points), saved.wires.map(w => w.points));
  const nl = netlist(doc);
  assert.deepEqual(nl.diagnostics, []);
  assert.equal(nl.pinNet.get('S1/O').name, 'y');
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl({ ...doc, lang }, { lang });
    assert.deepEqual(g.diagnostics, []);
    for (const l of lang === 'vhdl' ? ["O <= '1' when unsigned(A) > unsigned(B) else '0';", 'O => y'] : ['assign O = (A > B);', '.O(y)']) assert.ok(g.code.includes(l), `${l}\n${g.code}`);
  }
});

// a comparator with its O wired to the marker y, and what its pins connect to
function wired(rot = 0, mirror = false) {
  const doc = normalizeDoc({ name: 'w', lang: 'vhdl', ports: [], wires: [], labels: [],
    symbols: [{ id: 'S1', type: 'compare', name: 'U1', x: 300, y: 200, rot, mirror, params: { width: 4, op: 'eq' } }] });
  const at = n => symbolPins(doc.symbols[0]).find(q => q.name === n);
  const o = at('O'), far = { x: o.x + (o.x === 300 ? -200 : 200), y: o.y - 100 };
  doc.wires.push({ id: 'W1', points: [{ x: o.x, y: o.y }, { x: far.x, y: o.y }, { x: far.x, y: far.y }] });
  doc.ports.push({ id: 'P1', name: 'y', dir: 'out', width: 1, x: far.x, y: far.y });
  return normalizeDoc(doc);
}
const conn = (doc, pin) => netlist(doc).pinNet.get(`S1/${pin}`)?.name;

test('#1555 ticking: the wire of O follows it to its comparison\'s pin; a removed pin\'s wires dropped; every orientation', () => {
  for (const rot of [0, 90, 180, 270]) for (const mirror of [false, true]) {
    const doc = wired(rot, mirror), s = doc.symbols[0];
    assert.equal(conn(doc, 'O'), 'y');
    // EQ + GT: O becomes EQ, its wire following it
    let r = repinSymbol(doc, s, x => { x.params.op = 'eq,gt'; }, { rename: { O: 'EQ' } });
    assert.deepEqual(r.removed, []);
    let d = normalizeDoc(doc);
    assert.equal(conn(d, 'EQ'), 'y', `rot ${rot} mirror ${mirror}`);
    // (the operands left open in this sheet: their warnings only)
    const OPEN = ['input pin A of U1 (compare) is not connected', 'input pin B of U1 (compare) is not connected'];
    assert.deepEqual(netlist(d).diagnostics.map(x => x.message), OPEN, `rot ${rot} mirror ${mirror}`);
    // a wire on GT to the marker z
    const gt = symbolPins(d.symbols[0]).find(q => q.name === 'GT');
    d.wires.push({ id: 'W9', points: [{ x: gt.x, y: gt.y }, { x: gt.x, y: gt.y + 300 }] });
    d.ports.push({ id: 'P2', name: 'z', dir: 'out', width: 1, x: gt.x, y: gt.y + 300 });
    d = normalizeDoc(d);
    assert.equal(conn(d, 'GT'), 'z');
    // EQ unticked: its wire dropped, GT the only one left becomes O, z following it
    r = repinSymbol(d, d.symbols[0], x => { x.params.op = 'gt'; }, { rename: { GT: 'O' } });
    assert.deepEqual(r.removed, ['EQ']);
    d = normalizeDoc(d);
    assert.equal(conn(d, 'O'), 'z');
    assert.ok(!d.wires.some(w => w.id === 'W1'), 'the wire of EQ dropped');
    assert.deepEqual(netlist(d).diagnostics.map(x => x.message), [...OPEN, "I/O marker 'y' is not connected"]);
    assert.match(generateHdl(d, { lang: 'vhdl' }).code, /O <= '1' when unsigned\(U1_A_zero\) > unsigned\(U1_B_zero\) else '0';[^]*O => z/);
  }
});

test('#1555 followPins and otherPins: a pin moved off another symbol\'s pin it touched gets a wire', () => {
  const doc = normalizeDoc({ name: 't', lang: 'vhdl', ports: [], wires: [], labels: [], symbols: [
    { id: 'S1', type: 'compare', name: 'U1', x: 300, y: 200, params: { width: 1, op: 'eq' } },
    { id: 'S2', type: 'inv', name: 'U2', x: 380, y: 210, params: { width: 1 } }] });
  const o = symbolPins(doc.symbols[0]).find(q => q.name === 'O');
  const others = otherPins(doc, doc.symbols[0]);
  assert.ok(others.has(`${o.x},${o.y}`), 'INV\'s input on O');
  repinSymbol(doc, doc.symbols[0], x => { x.params.op = 'eq,ne'; }, { rename: { O: 'EQ' } });
  const d = normalizeDoc(doc), eq = symbolPins(d.symbols[0]).find(q => q.name === 'EQ');
  assert.ok(d.wires.some(w => w.points[0].x === o.x && w.points[0].y === o.y && w.points.at(-1).x === eq.x && w.points.at(-1).y === eq.y), JSON.stringify(d.wires));
  const nl = netlist(d);
  assert.equal(nl.pinNet.get('S1/EQ'), nl.pinNet.get('S2/I'));
  // (nothing moved: nothing changed)
  const before = JSON.stringify(d);
  followPins(d, new Map(), new Set());
  assert.equal(JSON.stringify(d), before);
});

test('#1555 ISE export: the comparisons in the xl_cmp symbol\'s name, read back; COMP8 = still the library comp8', () => {
  assert.deepEqual(decodeXlSymbol('xl_cmp4_lt_gt_s'), { type: 'compare', params: { width: 4, op: 'lt,gt', signed: true } });
  assert.deepEqual(decodeXlSymbol('xl_cmp3_eq_ne_lt_le_gt_ge_bits'), { type: 'compare', params: { width: 3, op: COMPARE_OPS.join(','), signed: false, bits: true } });
  assert.deepEqual(decodeXlSymbol('xl_cmp4_gt'), { type: 'compare', params: { width: 4, op: 'gt', signed: false } });
  assert.equal(decodeXlSymbol('xl_cmp4_'), null);
  const doc = normalizeDoc({ name: 't', lang: 'vhdl', ports: [], wires: [], labels: [], symbols: [
    { id: 'S1', type: 'compare', name: 'U1', x: 200, y: 100, params: { width: 4, op: 'gt,lt' } },
    { id: 'S2', type: 'compare', name: 'U2', x: 200, y: 300, params: { width: 8, op: 'eq' } }] });
  const r = exportIseSch(doc, { timestamp: 'T' });
  assert.deepEqual([...r.xml.matchAll(/<block symbolname="([^"]+)"/g)].map(m => m[1]), ['xl_cmp4_lt_gt', 'comp8']);
  const sym = r.files.find(f => f.path === 'xl_cmp4_lt_gt.sym').text;
  assert.deepEqual([...sym.matchAll(/<pin [^>]*name="([^"]+)"/g)].map(m => m[1]), ['A(3:0)', 'B(3:0)', 'LT', 'GT']);
  const back = importIseSch(r.xml, { name: 't', symbols: Object.fromEntries(r.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text])) });
  assert.deepEqual(back.doc.symbols.map(s => [s.name, s.params.op]).sort(), [['U1', 'lt,gt'], ['U2', 'eq']]);
});

test('#1555 Symbol Info: the text, formula and pins of several comparisons, in English and Portuguese; not a common property of several COMPs', () => {
  const en = symbolDoc('compare', { width: 3, op: 'lt,gt', signed: true }, { lang: 'en' });
  assert.match(en.text[0], /outputs every comparison ticked in Comparisons on a pin of its own.*LT \(A < B\), GT \(A > B\)\./);
  assert.equal(en.formula, 'LT = (A < B), GT = (A > B) (signed)');
  assert.deepEqual(en.pins.map(p => `${p.name}: ${p.func}`), ['A: First operand', 'B: Second operand', 'LT: 1 when A < B (signed), else 0', 'GT: 1 when A > B (signed), else 0']);
  assert.equal(en.params.find(p => p.name === 'op').label, 'Comparisons');
  const pt = symbolDoc('compare', { width: 3, op: 'eq' }, { lang: 'pt' });
  assert.match(pt.text[0], /dá O = 1 quando a relação marcada em Comparações se verifica \(aqui A = B\)/);
  assert.equal(pt.params.find(p => p.name === 'op').label, 'Comparações');
  assert.deepEqual(pt.pins.map(p => p.func).at(-1), '1 quando A = B (sem sinal), senão 0');
  const doc = normalizeDoc({ name: 't', lang: 'vhdl', ports: [], wires: [], labels: [], symbols: [
    { id: 'S1', type: 'compare', name: 'U1', x: 200, y: 100, params: { width: 4, op: 'gt' } }, { id: 'S2', type: 'compare', name: 'U2', x: 200, y: 300, params: { width: 4, op: 'lt' } }] });
  assert.deepEqual(commonProps(doc, ['sym:S1', 'sym:S2']).map(f => f.key), ['param:width', 'param:signed', 'param:bits']);
});
