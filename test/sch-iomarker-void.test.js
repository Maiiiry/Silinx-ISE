// I/O markers placed on empty space and wired later (#680): the default name, the netlist before and
// after the wire, the generated VHDL and Verilog (compiled and simulated) and Check Syntax's warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins, freePortName } from '../core/schdoc.js';

const sym = (doc, type, x, y, name) => { const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name, params: {} }; doc.symbols.push(s); return s; };
const pinAt = (doc, s, pin) => { const p = symbolPins(normalizeDoc({ ...doc, symbols: [s] }).symbols[0]).find(q => q.name === pin); return { x: p.x, y: p.y }; };
let wid = 0;
const wire = (doc, ...pts) => doc.wires.push({ id: `W${++wid}`, points: pts.map(p => ({ ...p })) });
// what the Add I/O Marker tool does on empty space: the next free name, 1 bit, at the grid point
const placeVoid = (doc, dir, x, y) => { const p = { id: `P${doc.ports.length + 1}`, name: freePortName(doc, dir), dir, width: 1, x, y }; doc.ports.push(p); return p; };
const diags = (doc, sev) => netlist(doc).diagnostics.filter(d => !sev || d.severity === sev).map(d => `${d.severity}: ${d.message}`);

test('freePortName: in1 / out1 / io1, the next free one, case-insensitive, net names and instances taken', () => {
  const doc = newDoc('top', 'vhdl');
  assert.equal(freePortName(doc, 'in'), 'in1');
  assert.equal(freePortName(doc, 'out'), 'out1');
  assert.equal(freePortName(doc, 'inout'), 'io1');
  assert.equal(freePortName(doc, undefined), 'in1');
  placeVoid(doc, 'in', 100, 100);
  assert.equal(doc.ports[0].name, 'in1');
  assert.equal(freePortName(doc, 'in'), 'in2');
  doc.ports.push({ id: 'P9', name: 'IN2', dir: 'in', width: 1, x: 0, y: 0 });
  doc.labels.push({ id: 'L1', x: 0, y: 0, net: 'in3(3 downto 0)' }, { id: 'L2', x: 0, y: 0, net: 'out1' });
  sym(doc, 'inv', 300, 300, 'In4');
  assert.equal(freePortName(doc, 'in'), 'in5');
  assert.equal(freePortName(doc, 'out'), 'out2');
  assert.equal(freePortName(doc, 'inout'), 'io1');
  // (a marker without a name, as a document may hold it, is ignored)
  assert.equal(freePortName({ ports: [{ id: 'P1' }] }, 'out'), 'out1');
});

test('a marker on empty space: a port of the netlist, a warning that it is not connected, no error', () => {
  const doc = newDoc('top', 'verilog');
  const p = placeVoid(doc, 'in', 100, 100);
  const nl = netlist(doc);
  assert.equal(nl.portNet.get(p.id).name, 'in1');
  assert.deepEqual(diags(doc), ["warning: I/O marker 'in1' is not connected"]);
  // a second one, an output, beside it (not touching): a net of its own
  placeVoid(doc, 'out', 300, 100);
  assert.deepEqual(diags(doc), ["warning: I/O marker 'in1' is not connected", "warning: I/O marker 'out1' is not connected"]);
  assert.notEqual(netlist(doc).portNet.get('P1'), netlist(doc).portNet.get('P2'));
});

// an inverter between two markers placed on empty space; then wired from a pin to each marker's tip
function voidThenWired(lang) {
  const doc = newDoc('top', lang);
  const inv = sym(doc, 'inv', 200, 200, 'XLXI_1');
  const a = placeVoid(doc, 'in', 100, 300), y = placeVoid(doc, 'out', 400, 300);
  return { doc, inv, a, y, wireUp: () => { wire(doc, { x: a.x, y: a.y }, { x: a.x + 20, y: a.y }, { x: a.x + 20, y: pinAt(doc, inv, 'I').y }, pinAt(doc, inv, 'I')); wire(doc, pinAt(doc, inv, 'O'), { x: y.x - 20, y: pinAt(doc, inv, 'O').y }, { x: y.x - 20, y: y.y }, { x: y.x, y: y.y }); } };
}

test('a wire drawn later to the tip of a marker placed on empty space connects it', () => {
  const { doc, inv, wireUp } = voidThenWired('vhdl');
  assert.deepEqual(diags(doc), ['warning: input pin I of XLXI_1 (inv) is not connected', "warning: I/O marker 'in1' is not connected", "warning: I/O marker 'out1' is not connected"]);
  wireUp();
  const nl = netlist(doc);
  assert.deepEqual(diags(doc), []);
  assert.equal(nl.pinNet.get(`${inv.id}/I`), nl.portNet.get('P1'));
  assert.equal(nl.pinNet.get(`${inv.id}/O`), nl.portNet.get('P2'));
  assert.equal(nl.pinNet.get(`${inv.id}/I`).name, 'in1');
  assert.equal(nl.pinNet.get(`${inv.id}/O`).name, 'out1');
});

test('a marker placed on empty space, then dragged onto a pin or a wire end: connected there', () => {
  const doc = newDoc('top', 'vhdl');
  const inv = sym(doc, 'inv', 200, 200, 'XLXI_1');
  const a = placeVoid(doc, 'in', 100, 300);
  const o = pinAt(doc, inv, 'O');
  wire(doc, o, { x: o.x + 60, y: o.y });
  const y = placeVoid(doc, 'out', 500, 300);
  assert.equal(diags(doc, 'error').length, 0);
  Object.assign(a, pinAt(doc, inv, 'I'));            // onto the pin
  Object.assign(y, { x: o.x + 60, y: o.y });          // onto the wire's end
  const nl = netlist(doc);
  assert.equal(nl.pinNet.get(`${inv.id}/I`), nl.portNet.get(a.id));
  assert.equal(nl.pinNet.get(`${inv.id}/O`), nl.portNet.get(y.id));
  assert.deepEqual(diags(doc), []);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: markers placed on empty space are ports of the generated HDL; wired later, it simulates`, () => {
    const { doc, wireUp } = voidThenWired(lang);
    const g0 = generateHdl(doc, { lang });
    assert.deepEqual(g0.diagnostics.filter(d => d.severity === 'error'), []);
    assert.match(g0.code, lang === 'vhdl' ? /in1 : in std_logic;\s*out1 : out std_logic/ : /input wire in1,\s*output wire out1/);
    wireUp();
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, []);
    assert.match(g.code, lang === 'vhdl' ? /out1 <= not in1;/ : /assign out1 = ~in1;/);
    const tb = lang === 'vhdl' ? `
library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal a, y : std_logic;
begin
  u : entity work.top port map (in1 => a, out1 => y);
  process begin
    a <= '0'; wait for 10 ns; assert y = '1' report "bad y0" severity error;
    a <= '1'; wait for 10 ns; assert y = '0' report "bad y1" severity error;
    report "done"; wait;
  end process;
end;` : `
module tb;
  reg a; wire y;
  top u (.in1(a), .out1(y));
  initial begin
    a = 0; #10; if (y !== 1'b1) $display("bad y0");
    a = 1; #10; if (y !== 1'b0) $display("bad y1");
    $display("done");
  end
endmodule`;
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/^.*?(done|bad \w+).*$/, '$1')).filter(t => /done|bad/.test(t)), ['done']);
  });

  test(`${lang}: Check Syntax of markers left unconnected: XST's warnings, no error`, () => {
    // the inverter wired, then an input, an output and a bidirectional marker left on empty space
    const { doc, wireUp } = voidThenWired(lang);
    wireUp();
    placeVoid(doc, 'in', 100, 500); placeVoid(doc, 'out', 300, 500); placeVoid(doc, 'inout', 500, 500);
    assert.deepEqual(doc.ports.map(p => p.name), ['in1', 'out1', 'in2', 'out2', 'io1']);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => `${d.severity}: ${d.message}`), ["warning: I/O marker 'in2' is not connected", "warning: I/O marker 'out2' is not connected", "warning: I/O marker 'io1' is not connected"]);
    const path = `top.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    const lib = compile([{ path, text: g.code, lang }]);
    const design = elaborate(lib, 'top');
    assert.deepEqual([...lib.errors, ...design.diags], []);
    assert.deepEqual(designChecks(lib, design).map(d => `${d.severity}: ${d.message}`), [
      'warning: Input <in2> is never used.',
      'warning: Signal <out2>, unconnected in block <top>, is tied to its initial value.',
      // (io1, bidirectional: no warning yet; XST's own to be learnt and matched, #684)
    ]);
  });
}
