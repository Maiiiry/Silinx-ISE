// A bus tap the wrong way round (#1702): its output O on a bus, its input I on a wire. The bus keeps its width (it
// was taken from the tap's 1-bit O when a symbol's output drove it: a bus turned into a wire), the tap's O is not
// connected to it, and one error says so on the tap. A tap the right way round, and a tap's O into a wider input
// (a width mismatch), are as before; the right one generated, compiled and elaborated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { newDoc, normalizeDoc, netlist, generateHdl, symbolPins } from '../core/schdoc.js';

const WRONG = (bus, w = 8) => `error bus tap T1 is the wrong way round: its output O (1 bit) touches the ${w}-bit bus '${bus}' and is not connected to it; the bus goes to its input I`;
const tap = (x, y, msb = 2, lsb = 2) => ({ id: 'S1', type: 'slice', x, y, rot: 0, mirror: false, name: 'T1', params: { msb, lsb } });   // I at (x, y) on its bus, O at (x+40, y+10) (#1726)
const diags = (nl) => nl.diagnostics.map(d => `${d.severity} ${d.message}`);
const netOf = (nl, wire) => nl.wireNet.get(wire);

// the tap at (300, 200) reversed: its O (340, 210) on the bus W1, its I (300, 200) on W2 to the output marker y
function reversed({ src }) {
  const d = newDoc('rt', 'vhdl');
  d.symbols.push(tap(300, 200));
  d.wires.push({ id: 'W1', points: [{ x: 500, y: 210 }, { x: 340, y: 210 }] });
  if (src === 'port') d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 8, x: 500, y: 210 });
  if (src === 'label') d.labels.push({ id: 'L1', net: 'a(7:0)', x: 450, y: 210 });
  if (src === 'counter') {   // its Q (8 bits) at (500, 10)
    d.symbols.push({ id: 'S2', type: 'counter', x: 410, y: 0, rot: 0, mirror: false, name: 'C1', params: { width: 8 } });
    d.wires.push({ id: 'W3', points: [{ x: 500, y: 210 }, { x: 500, y: 10 }] });
  }
  d.wires.push({ id: 'W2', points: [{ x: 300, y: 200 }, { x: 200, y: 200 }] });
  d.ports.push({ id: 'P2', name: 'y', dir: 'out', width: 1, x: 200, y: 200 });
  return netlist(normalizeDoc(d));
}

test('#1702 a bus tap the wrong way round on a counter\'s bus: the bus stays 8 bits, the tap\'s O not on it, one error on the tap', () => {
  const nl = reversed({ src: 'counter' });
  const bus = netOf(nl, 'W1');
  assert.equal(bus.width, 8);
  assert.deepEqual([bus.name, bus.wires, bus.endpoints.map(e => `${e.sym}/${e.pin}`)], ['net_1', ['W1', 'W3'], ['S2/Q']]);
  const o = nl.pinNet.get('S1/O');
  assert.notEqual(o, bus);
  assert.deepEqual([o.width, o.endpoints.length, o.wires], [1, 1, []]);
  assert.deepEqual(diags(nl), [
    "warning net 'y' has no driver (read by T1.I, port y)",
    "warning net 'net_1' connects only C1.Q",
    WRONG('net_1'),
    'warning input pin CE of C1 (counter) is not connected',
    'warning input pin C of C1 (counter) is not connected',
    'warning input pin CLR of C1 (counter) is not connected',
  ]);
});

test('#1702 a bus tap the wrong way round on an input marker\'s bus, or a named bus: the tap\'s error, not the bus\'s', () => {
  let nl = reversed({ src: 'port' });
  assert.deepEqual([netOf(nl, 'W1').name, netOf(nl, 'W1').width], ['a', 8]);
  assert.deepEqual(diags(nl), [
    "warning net 'y' has no driver (read by T1.I, port y)",
    WRONG('a'),
    "warning I/O marker 'a' is not connected",
  ]);
  nl = reversed({ src: 'label' });
  assert.deepEqual([netOf(nl, 'W1').name, netOf(nl, 'W1').width], ['a', 8]);
  assert.deepEqual(diags(nl), [
    "warning net 'y' has no driver (read by T1.I, port y)",
    "warning dangling wire (net 'a') not connected to any pin",
    WRONG('a'),
  ]);
});

// a(7:0) -> the tap (bits msb..lsb) -> y
function rightWay(lang, { msb = 2, lsb = 2, yWidth = msb - lsb + 1 } = {}) {
  const d = newDoc('tapok', lang);
  d.symbols.push(tap(300, 200, msb, lsb));
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 8, x: 200, y: 200 }, { id: 'P2', name: 'y', dir: 'out', width: yWidth, x: 500, y: 210 });
  d.wires.push({ id: 'W1', points: [{ x: 200, y: 200 }, { x: 300, y: 200 }], bus: true }, { id: 'W2', points: [{ x: 340, y: 210 }, { x: 500, y: 210 }] });
  return normalizeDoc(d);
}

// a = "11111011" then "00000100": y (a(2)) 0 then 1
const TB = {
  vhdl: 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end;\narchitecture s of tb is signal a : std_logic_vector(7 downto 0); signal y, y0 : std_logic; begin\n'
    + ' u : entity work.tapok port map (a => a, y => y);\n'
    + ' process begin a <= "11111011"; wait for 1 ns; y0 <= y; a <= "00000100"; wait for 1 ns; report std_logic\'image(y0) & " " & std_logic\'image(y); wait; end process;\nend;',
  verilog: 'module tb; reg [7:0] a; wire y; reg y0; tapok u(.a(a), .y(y)); initial begin a = 8\'b11111011; #1 y0 = y; a = 8\'b00000100; #1 $display("%b %b", y0, y); end endmodule',
};

test('#1702 a bus tap the right way round: connected as before, no warnings; generated, compiled and elaborated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = rightWay(lang);
    const nl = netlist(doc);
    assert.deepEqual([netOf(nl, 'W1').width, netOf(nl, 'W2').width, nl.pinNet.get('S1/O') === netOf(nl, 'W2')], [8, 1, true]);
    assert.deepEqual(diags(nl), [], 'no warnings');
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics, [], `${lang}: no errors, no warnings`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `tapok.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), [], `${lang}: compile/elaboration errors`);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '')), ['0 1'], `${lang}: y follows a(2)`);
  }
});

test('#1702 a 4-bit tap\'s O into an 8-bit output marker: a width mismatch, not a tap the wrong way round', () => {
  const nl = netlist(rightWay('vhdl', { msb: 3, lsb: 0, yWidth: 8 }));
  assert.equal(nl.pinNet.get('S1/O'), netOf(nl, 'W2'));
  assert.deepEqual(diags(nl), ["error width mismatch on net 'y': 8 vs 4 bits"]);
});

// #1691: a bus tap's MSB below its LSB (MSB 1, LSB 2 of a(3:0)): its HDL would be a(1 to 2) / a[1:2], against the bus's
// direction (illegal in both languages, #1692): an error on the tap; MSB = LSB and MSB > LSB, none
test('#1691 a bus tap with its MSB below its LSB: an error on the tap, in the check and the HDL generation', async () => {
  const { symbolPins } = await import('../core/schdoc.js');
  const of = (msb, lsb) => {
    const d = newDoc('rv', 'vhdl');
    d.symbols.push(tap(300, 200, msb, lsb));
    const pins = Object.fromEntries(symbolPins(normalizeDoc(d).symbols[0]).map((p) => [p.name, p]));
    d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 4, x: pins.I.x - 60, y: pins.I.y }, { id: 'P2', name: 'y', dir: 'out', width: Math.abs(msb - lsb) + 1, x: pins.O.x + 60, y: pins.O.y });
    d.wires.push({ id: 'W1', points: [{ x: pins.I.x - 60, y: pins.I.y }, { x: pins.I.x, y: pins.I.y }], bus: true }, { id: 'W2', points: [{ x: pins.O.x, y: pins.O.y }, { x: pins.O.x + 60, y: pins.O.y }] });
    return normalizeDoc(d);
  };
  const ERR = 'error bus tap T1: its MSB (1) is below its LSB (2): a bus tap takes the bits MSB downto LSB';
  assert.deepEqual(diags(netlist(of(1, 2))), [ERR]);
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl({ ...of(1, 2), lang }, { lang }).diagnostics.map((x) => `${x.severity} ${x.message}`), [ERR], lang);
  for (const [m, l] of [[2, 1], [2, 2], [3, 0]]) assert.deepEqual(diags(netlist(of(m, l))), [], `${m}..${l}`);
});

// #1690: a bus tap of bits its bus does not have: an error on the tap (the HDL took a(5) of a(3:0), a warning on the
// generated file only, and failed in simulation); the bits it has, no error; a tap with nothing on its input, no such error
function tapOf(msb, lsb, width = 4) {
  const d = newDoc('tr', 'vhdl');
  const t = tap(300, 200, msb, lsb);
  d.symbols.push(t);
  const pins = Object.fromEntries(symbolPins(normalizeDoc(d).symbols[0]).map((p) => [p.name, p]));
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width, x: pins.I.x - 60, y: pins.I.y }, { id: 'P2', name: 'y', dir: 'out', width: Math.abs(msb - lsb) + 1, x: pins.O.x + 60, y: pins.O.y });
  d.wires.push({ id: 'W1', points: [{ x: pins.I.x - 60, y: pins.I.y }, { x: pins.I.x, y: pins.I.y }], bus: width > 1 }, { id: 'W2', points: [{ x: pins.O.x, y: pins.O.y }, { x: pins.O.x + 60, y: pins.O.y }] });
  return normalizeDoc(d);
}
test('#1690 a bus tap of bits outside its bus: an error on the tap, in the check and the HDL generation; the bits it has, none', () => {
  assert.deepEqual(diags(netlist(tapOf(5, 5))), ["error bus tap T1 takes bit 5, outside its bus 'a' (3 downto 0)"]);
  assert.deepEqual(diags(netlist(tapOf(4, 2))), ["error bus tap T1 takes bits 4..2, outside its bus 'a' (3 downto 0)"]);
  assert.deepEqual(diags(netlist(tapOf(1, 1, 1))), ["error bus tap T1 takes bit 1, outside its bus 'a' (one bit, 0)"]);
  assert.deepEqual(generateHdl(tapOf(5, 5)).diagnostics.map((x) => `${x.severity} ${x.message}`), ["error bus tap T1 takes bit 5, outside its bus 'a' (3 downto 0)"]);
  for (const [m, l] of [[3, 3], [3, 0], [0, 0]]) assert.deepEqual(diags(netlist(tapOf(m, l))), [], `${m}..${l}`);
  assert.deepEqual(diags(netlist(tapOf(0, 0, 1))), [], 'bit 0 of one bit');
  // nothing on its input: unconnected, not outside
  const alone = newDoc('al', 'vhdl');
  alone.symbols.push(tap(300, 200, 5, 5));
  assert.deepEqual(diags(netlist(normalizeDoc(alone))).filter((x) => /outside/.test(x)), []);
});
