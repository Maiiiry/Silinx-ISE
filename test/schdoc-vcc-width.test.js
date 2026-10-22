// VCC and GND with a Width (#953): a VCC / GND of width N drives every bit of a bus; generated, compiled,
// elaborated and simulated in VHDL and Verilog; its width checked against its net; one saved before it had a
// Width keeps taking its net's width and generating the same HDL; ISE .sch export and import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins, symbolDef, defaultParams, SYMBOLS } from '../core/schdoc.js';
import { exportIseSch } from '../core/isesch-export.js';
import * as isesch from '../core/isesch.js';
import { symbolDoc } from '../core/symdocs.js';
import { buildLiveSim } from '../core/schlive.js';
import * as V from '../core/values.js';

function sym(doc, type, x, y, params = {}, name) {
  const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: name || `U${doc.symbols.length + 1}`, params: { ...params } };
  doc.symbols.push(s);
  return s;
}
const pinAt = (doc, s) => { const p = symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0], {})[0]; return { x: p.x, y: p.y }; };
let wid = 0;
const wire = (doc, ...pts) => doc.wires.push({ id: `W${++wid}`, points: pts.map(p => ({ ...p })) });
const port = (doc, name, dir, x, y, width = 1) => { const p = { id: `P${doc.ports.length + 1}`, name, dir, width, x, y }; doc.ports.push(p); return p; };
const conn = (doc, a, b) => { if (a.y === b.y || a.x === b.x) wire(doc, a, b); else wire(doc, a, { x: a.x, y: b.y }, b); };

// a VCC and a GND (params given, or none: a schematic saved before #953) on two outputs of `w` bits, and a VCC of
// one bit on a scalar output
function design(lang, { vcc = { width: 8 }, gnd = { width: 8 }, w = 8 } = {}) {
  const doc = newDoc('ties', lang);
  const v = sym(doc, 'vcc', 100, 100, vcc), g = sym(doc, 'gnd', 100, 300, gnd), v1 = sym(doc, 'vcc', 100, 500, { width: 1 });
  port(doc, 'ones', 'out', 400, 200, w); port(doc, 'zeros', 'out', 400, 250, w); port(doc, 's', 'out', 400, 600);
  conn(doc, pinAt(doc, v), { x: 400, y: 200 });
  conn(doc, pinAt(doc, g), { x: 400, y: 250 });
  conn(doc, pinAt(doc, v1), { x: 400, y: 600 });
  if (!vcc.width) delete doc.symbols[0].params.width;
  if (!gnd.width) delete doc.symbols[1].params.width;
  return doc;
}
const TB = {
  vhdl: 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is signal o, z : std_logic_vector(7 downto 0); signal s : std_logic; begin\n'
    + ' u : entity work.ties port map (ones => o, zeros => z, s => s);\n'
    + ' process begin wait for 1 ns; if o = "11111111" and z = "00000000" and s = \'1\' then report "ok"; else report "bad"; end if; wait; end process;\nend;',
  verilog: 'module tb; wire [7:0] o, z; wire s; ties u(.ones(o), .zeros(z), .s(s)); initial begin #1 $display("%b %b %b", o, z, s); end endmodule',
};
function run(lang, code) {
  const files = [{ path: lang === 'vhdl' ? 'ties.vhd' : 'ties.v', text: code }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: TB[lang] }];
  const r = simulate(files, 'tb', { until: 1e7 });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], 'compile/elaboration errors');
  return r.sim.log.map(l => l.text.replace(/'/g, ''));
}

test('#953 VCC / GND: a Width parameter, 1 by default; the output pin a bus of that width', () => {
  for (const t of ['vcc', 'gnd']) {
    assert.deepEqual(SYMBOLS[t].params.map(p => [p.name, p.label, p.kind, p.default, p.min]), [['width', 'Width', 'int', 1, 1]]);
    assert.deepEqual(defaultParams(t), { width: 1 });
    assert.deepEqual(symbolDef({ type: t, params: { width: 8 } }).pins.map(p => [p.name, p.dir, p.width]), [[t === 'vcc' ? 'P' : 'G', 'out', 8]]);
    assert.equal(symbolDef({ type: t, params: { width: 1 } }).pins[0].width, 1);
    // (saved before the Width: none, the net's)
    assert.equal(symbolDef({ type: t, params: {} }).pins[0].width, null);
    assert.equal(symbolDoc(t, { width: 4 }).pins[0].widthText, '4');
    assert.equal(symbolDoc(t, {}, { lang: 'pt' }).pins[0].widthText, '1');
  }
});

for (const lang of ['vhdl', 'verilog']) {
  test(`#953 VCC / GND of 8 bits and of 1 bit: generated, compiled, elaborated and simulated (${lang})`, () => {
    const doc = normalizeDoc(design(lang));
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, [], 'no errors, no warnings');
    if (lang === 'vhdl') {
      assert.match(g.code, /\n\s+ones <= \(others => '1'\);\n/);
      assert.match(g.code, /\n\s+zeros <= \(others => '0'\);\n/);
      assert.match(g.code, /\n\s+s <= '1';\n/);
    } else {
      assert.match(g.code, /assign ones = \{8\{1'b1\}\};/);
      assert.match(g.code, /assign zeros = \{8\{1'b0\}\};/);
      assert.match(g.code, /assign s = 1'b1;/);
    }
    assert.deepEqual(run(lang, g.code), [lang === 'vhdl' ? 'ok' : '11111111 00000000 1']);
  });

  test(`#953 VCC / GND of 8 bits in the in-place simulation: every bit of the bus and of its pin (${lang})`, () => {
    const doc = normalizeDoc(design(lang));
    const r = buildLiveSim(doc, { lang });
    assert.deepEqual(r.errors, [], r.code);
    const port = n => doc.ports.find(p => p.name === n).id;
    assert.equal(V.toBin(r.live.portValue(port('ones'))), '11111111');
    assert.equal(V.toBin(r.live.portValue(port('zeros'))), '00000000');
    assert.equal(V.toBin(r.live.portValue(port('s'))), '1');
    assert.equal(V.toBin(r.live.pinValue(doc.symbols[0].id, 'P')), '11111111');
    assert.equal(V.toBin(r.live.pinValue(doc.symbols[1].id, 'G')), '00000000');
  });

  test(`#953 a VCC / GND saved before the Width: kept without one, the net's width, the same HDL (${lang})`, () => {
    const old = design(lang, { vcc: {}, gnd: {} });
    const doc = normalizeDoc(JSON.parse(JSON.stringify(old)));
    assert.deepEqual(doc.symbols.map(s => s.params), [{}, {}, { width: 1 }]);
    assert.deepEqual(JSON.parse(JSON.stringify(normalizeDoc(JSON.parse(JSON.stringify(doc))))).symbols, JSON.parse(JSON.stringify(doc)).symbols);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, [], 'no errors, no warnings');
    // (the bit strings generated before #953)
    if (lang === 'vhdl') { assert.match(g.code, /ones <= "11111111";/); assert.match(g.code, /zeros <= "00000000";/); }
    else { assert.match(g.code, /assign ones = 8'b11111111;/); assert.match(g.code, /assign zeros = 8'b00000000;/); }
    assert.deepEqual(run(lang, g.code), [lang === 'vhdl' ? 'ok' : '11111111 00000000 1']);
  });

  test(`#953 a VCC / GND whose Width is not its net's: the width mismatch error (${lang})`, () => {
    const doc = normalizeDoc(design(lang, { vcc: { width: 4 }, gnd: { width: 1 } }));
    const nl = netlist(doc, {});
    assert.deepEqual(nl.diagnostics.map(d => `${d.severity}: ${d.message}`),
      ["error: width mismatch on net 'ones': 8 vs 4 bits", "error: width mismatch on net 'zeros': 8 vs 1 bits"]);
  });
}

test('#953 ISE .sch export: a VCC / GND of one bit the library\'s, a wider one a constant symbol; read back', () => {
  const doc = normalizeDoc(design('vhdl'));
  const r = exportIseSch(doc, { timestamp: 'T' });
  assert.deepEqual([...r.xml.matchAll(/<block symbolname="([^"]+)"/g)].map(m => m[1]), ['xl_const8_hff', 'xl_const8_h0', 'vcc']);
  const symbols = Object.fromEntries(r.files.filter(f => f.kind === 'sym').map(f => [f.path, f.text]));
  const back = isesch.importIseSch(r.xml, { name: 'ties', symbols });
  assert.deepEqual(back.doc.symbols.map(s => [s.type, s.params]).sort((a, b) => a[0].localeCompare(b[0])),
    [['constant', { value: '0xff', width: 8 }], ['constant', { value: '0x0', width: 8 }], ['vcc', { width: 1 }]]);
  const g = generateHdl(back.doc, { lang: 'vhdl' });
  assert.deepEqual(g.diagnostics.filter(d => d.severity === 'error'), []);
  assert.deepEqual(run('vhdl', g.code), ['ok']);
});
