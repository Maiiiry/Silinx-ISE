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
