// The HDL generated from a schematic (#405: core/schdoc-hdl.js out of schdoc.js, generateHdl's symbols in
// schdoc-hdl-symbol.js, schdoc-hdl-cases.js, schdoc-hdl-more.js): schdoc.js still exports generateHdl; a sheet of one
// symbol of each kind, every pin wired to an I/O marker, generates VHDL and Verilog that compile and elaborate with no
// error, its diagnostics as expected (none, or an empty HDL block's warning); a symbol left alone takes the paths that
// skip it, with their warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as schdoc from '../core/schdoc.js';
import { generateHdl } from '../core/schdoc-hdl.js';
import { mountSymbolHdl } from '../core/schdoc-hdl-symbol.js';
import { mountSymbolCases } from '../core/schdoc-hdl-cases.js';
import { mountSymbolCasesMore } from '../core/schdoc-hdl-more.js';
import { compile, elaborate } from '../core/compile.js';

const { normalizeDoc, symbolPins } = schdoc;
// a sheet of one symbol, its pins wired to I/O markers or not
function sheet(type, lang, wired) {
  const sym = { id: 'S1', type, name: 'U1', x: 400, y: 400, params: {} };
  const pins = symbolPins(normalizeDoc({ symbols: [sym] }).symbols[0]);
  const ports = wired ? pins.map((p, i) => ({ id: `P${i}`, name: `p${i}`, dir: p.dir === 'out' ? 'out' : p.dir === 'inout' ? 'inout' : 'in', width: p.width || 1, x: p.x, y: p.y })) : [];
  return normalizeDoc({ name: 'sheet', lang, symbols: [sym], ports, wires: [], labels: [] });
}

test('#405 schematic HDL: schdoc.js exports generateHdl; the parts are the modules\'', () => {
  assert.equal(schdoc.generateHdl, generateHdl);
  for (const f of [mountSymbolHdl, mountSymbolCases, mountSymbolCasesMore]) assert.equal(typeof f, 'function');
});

test('#405 schematic HDL: a symbol of each kind, wired, in VHDL and Verilog: compiled and elaborated with no error', () => {
  // gates and flip-flops (the symbol part), multiplexers to encoders (the cases), adders to HDL blocks (the more)
  const TYPES = ['and2', 'fdce', 'mux4', 'demux', 'tbuf', 'decoder', 'encoder', 'add', 'compare', 'constant', 'slice', 'busjoin', 'register', 'counter', 'hdlblock'];
  for (const type of TYPES) {
    for (const lang of ['vhdl', 'verilog']) {
      const g = generateHdl(sheet(type, lang, true), {});
      assert.deepEqual(g.diagnostics.map((d) => `${d.severity}: ${d.message}`), type === 'hdlblock' ? ['warning: U1: HDL block is empty'] : [], `${type} ${lang}`);
      const lib = compile([{ path: g.filename, lang, text: g.code }]);
      assert.deepEqual(lib.errors.filter((e) => e.severity === 'error').map((e) => e.message), [], `${type} ${lang}: compile`);
      assert.deepEqual(elaborate(lib, 'sheet').diags.filter((e) => e.severity === 'error').map((e) => e.message), [], `${type} ${lang}: elaborate`);
    }
  }
});

test('#405 schematic HDL: a symbol left alone, skipped with its warning (or error)', () => {
  const said = (type) => generateHdl(sheet(type, 'vhdl', false), {}).diagnostics.map((d) => `${d.severity}: ${d.message}`);
  assert.ok(said('register').includes('warning: U1: no output connected, skipped'));
  assert.ok(said('mux4').includes('warning: U1: no output connected, skipped'));
  assert.ok(said('decoder').includes('warning: U1: no output connected, skipped'));
  assert.deepEqual(said('module'), ["error: U1: module '' not found in the project", 'error: U1: no module selected']);
  assert.ok(said('and2').includes('warning: U1: input I0 unconnected, tied to 0'));
});

// #1693: a 1-bit bus tap into an output marker that is also read inside the schematic (its <port>_int copy): the VHDL
// takes the bit, a std_logic, not a slice of one bit (`msb_int <= a(7 downto 7)`, a type error)
test('#1693 a 1-bit tap into an output read back: msb_int <= a(7), Check Syntax clean, the bit simulated in VHDL and Verilog', async () => {
  const { normalizeDoc, symbolPins } = await import('../core/schdoc.js');
  const { compile, elaborate, simulate } = await import('../core/compile.js');
  const { designChecks } = await import('../core/lint.js');
  const d = { version: 5, name: 'rb', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] };
  const V = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
  let n = 0;
  // each pin a short wire with a net name: a(7:0) -> tap 7 -> msb (output) -> AND with a(0) -> ends
  const sym = (type, params, conn) => {
    const s = { id: `S${++n}`, type, x: 300, y: 100 + 100 * n, rot: 0, mirror: false, name: `U${n}`, params };
    d.symbols.push(s);
    for (const p of symbolPins(normalizeDoc({ ...d, symbols: [s] }).symbols[0])) {
      if (!conn[p.name]) continue;
      const e = { x: p.x + 20 * V[p.side][0], y: p.y + 20 * V[p.side][1] };
      d.wires.push({ id: `W${++n}`, points: [{ x: p.x, y: p.y }, e] });
      d.labels.push({ id: `L${++n}`, x: e.x, y: e.y, net: conn[p.name] });
    }
  };
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 8, x: 100, y: 100 }, { id: 'P2', name: 'msb', dir: 'out', width: 1, x: 900, y: 100 }, { id: 'P3', name: 'ends', dir: 'out', width: 1, x: 900, y: 200 });
  d.wires.push({ id: 'WA', points: [{ x: 100, y: 100 }, { x: 120, y: 100 }], bus: true }, { id: 'WM', points: [{ x: 880, y: 100 }, { x: 900, y: 100 }] }, { id: 'WE', points: [{ x: 880, y: 200 }, { x: 900, y: 200 }] });
  sym('slice', { msb: 7, lsb: 7 }, { I: 'a', O: 'msb' });
  sym('slice', { msb: 0, lsb: 0 }, { I: 'a', O: 'a0' });
  sym('and2', { width: 1 }, { I0: 'msb', I1: 'a0', O: 'ends' });
  const doc = normalizeDoc(d);
  const TB = {
    vhdl: 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is signal a : std_logic_vector(7 downto 0); signal msb, ends : std_logic; begin\n u : entity work.rb port map (a => a, msb => msb, ends => ends);\n process begin a <= "10000001"; wait for 1 ns; report std_logic\'image(msb) & std_logic\'image(ends); a <= "10000000"; wait for 1 ns; report std_logic\'image(msb) & std_logic\'image(ends); wait; end process;\nend;',
    verilog: 'module tb; reg [7:0] a; wire msb, ends; rb u(.a(a), .msb(msb), .ends(ends)); initial begin a = 8\'b10000001; #1 $display("%b%b", msb, ends); a = 8\'b10000000; #1 $display("%b%b", msb, ends); end endmodule',
  };
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl({ ...doc, lang }, { lang });
    assert.deepEqual(g.diagnostics, [], lang);
    if (lang === 'vhdl') assert.match(g.code, /msb_int <= a\(7\);/);
    const src = [{ path: `rb.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }];
    const lib = compile(src), design = elaborate(lib, 'rb');
    assert.deepEqual([...lib.errors, ...design.diags, ...designChecks(lib, design, { lint: true })].map(x => `${x.severity}: ${x.message}`), ['warning: Input <a<6:1>> is never used.'], `${lang}: Check Syntax, a(6:1) unused`);
    const r = simulate([...src, { path: `tb.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: TB[lang] }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '')), ['11', '10'], `${lang}: msb = a(7), ends = a(7) and a(0)`);
  }
});
