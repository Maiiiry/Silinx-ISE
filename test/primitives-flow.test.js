// The device primitives of the schematic library (#791) through the Silinx toolchain: a schematic of a Basys2
// (XC3S250E) using IBUFG, DCM_SP, BUFG, a RAMB16_S9 with its contents and a MULT18X18SIO, with a counter, a bus join
// and a bus tap of the library, its HDL generated in VHDL and in Verilog, synthesized, mapped, placed, routed and
// its bitstream written with no warning; the generated HDL simulated: the LEDs show the product of the ROM's words
// and the switches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, symbolDef, newDoc, netlist, generateHdl } from '../core/schdoc.js';
import { orderOpenSteps } from '../core/open-steps.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { flow } from './timesim-lib.mjs';

const ROM = ['03', '05', '07', '0B', '0D', '11', '13', '17'];
// the schematic: every pin on a short wire ended by a label of its net (the same name joins them), the ports'
// I/O markers on wires of their own with their labels; the logic on CLKFX (75 MHz), CLK0 the DCM's feedback
function design(lang) {
  const doc = newDoc('top', lang);
  let k = 0, w = 0;
  const stub = (x, y, side, net) => {
    const dx = side === 'W' ? -20 : 20;
    doc.wires.push({ id: `W${++w}`, points: [{ x, y }, { x: x + dx, y }] });
    doc.labels.push({ id: `L${w}`, x: x + dx, y, net });
  };
  const sym = (type, params, conns) => {
    k++;
    const s = { id: `S${k}`, type, x: 200 + 400 * ((k - 1) % 3), y: 200 + 700 * Math.floor((k - 1) / 3), rot: 0, mirror: false, name: `X${k}`, params: { ...defaultParams(type), ...params } };
    doc.symbols.push(s);
    for (const q of symbolDef(s).pins) if (conns[q.name]) stub(s.x + q.x, s.y + q.y, q.side, conns[q.name]);
  };
  const port = (name, dir, width, i) => {
    const x = dir === 'in' ? 60 : 1800, y = 2400 + 60 * i;
    doc.ports.push({ id: `P${i}`, name, dir, width, x, y });
    stub(x, y, dir === 'in' ? 'E' : 'W', name);
  };
  port('clk', 'in', 1, 1); port('sw', 'in', 8, 2); port('led', 'out', 8, 3);
  sym('ibufg', {}, { I: 'clk', O: 'clkin' });
  sym('dcm_sp', { CLKFX_MULTIPLY: 3, CLKFX_DIVIDE: 2, CLKIN_PERIOD: '20.0' }, { CLKIN: 'clkin', CLKFB: 'clk0', CLK0: 'clk0u', CLKFX: 'clkfxu' });
  sym('bufg', {}, { I: 'clk0u', O: 'clk0' });
  sym('bufg', {}, { I: 'clkfxu', O: 'clkfx' });
  sym('counter', { width: 11, en: false, reset: 'none' }, { C: 'clkfx', Q: 'addr' });
  sym('ramb16_s', { portWidth: '9', contents: ROM.join(' ') }, { ADDR: 'addr', CLK: 'clkfx', DO: 'word' });
  sym('constant', { value: '0', width: 10 }, { O: 'zero' });
  sym('busjoin', { widths: '10,8' }, { I0: 'zero', I1: 'word', O: 'a' });
  sym('busjoin', { widths: '10,8' }, { I0: 'zero', I1: 'sw', O: 'b' });
  sym('mult18x18sio', { AREG: 0, BREG: 0, PREG: 1 }, { A: 'a', B: 'b', CLK: 'clkfx', P: 'p' });
  sym('slice', { msb: 7, lsb: 0 }, { I: 'p', O: 'led' });
  return doc;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`${lang}: a schematic of IBUFG, DCM_SP, BUFG, RAMB16_S9 and MULT18X18SIO, generated, built by the Silinx toolchain for the XC3S250E with no warning`, { timeout: 600000 }, async () => {
    const doc = design(lang);
    assert.deepEqual(netlist(doc).diagnostics.map(d => d.message), []);
    const g = generateHdl(doc, { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), []);
    assert.match(g.code, lang === 'vhdl' ? /X6 : RAMB16_S9\n    generic map \([\s\S]*INIT_00 => X"0+1713110D0B070503"/ : /RAMB16_S9 #\(\n[\s\S]*\.INIT_00\(256'h0+1713110D0B070503\)\n  \) X6 \(/);
    const src = { path: g.filename, lang, text: g.code };

    // simulated: the ROM's words times the switches
    const lib = compile([...primitiveSources([src]), src]);
    const d = elaborate(lib, 'top');
    assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
    const s = new Simulator(d);
    const port = n => d.top.ports.find(p => p.name.toLowerCase() === n).sig;
    s.force(port('sw'), V.mk(8, 3n));
    const seen = new Set();
    for (let t = 0; t < 2000000; t += 10000) {
      s.force(port('clk'), V.mk(1, (t / 10000) % 2 === 0 ? 1n : 0n));
      s.run(t + 10000);
      const v = port('led').val;
      if (!v.x) seen.add(Number(v.v));
    }
    for (const w of ROM) assert.ok(seen.has((parseInt(w, 16) * 3) & 0xFF), `${w} × 3 on the LEDs: ${[...seen]}`);

    const ucf = 'NET "clk" LOC = "B8" | IOSTANDARD = LVCMOS33 ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n'
      + ['P11', 'L3', 'K3', 'B4', 'G3', 'F3', 'E2', 'N3'].map((l, i) => `NET "sw<${i}>" LOC = "${l}" | IOSTANDARD = LVCMOS33 ;\n`).join('')
      + ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'].map((l, i) => `NET "led<${i}>" LOC = "${l}" | IOSTANDARD = LVCMOS33 ;\n`).join('');
    const r = await flow({ top: 'top', steps: orderOpenSteps(['bitgen']) }, [src], [], ucf);
    assert.equal(r.ok, true, r.lines.join('\n'));
    assert.deepEqual(r.lines.filter(l => /warning/i.test(l)), []);
    assert.ok(r.store['top.bit'], 'the bitstream');
    // the primitives in the design: the MAP report's
    const map = r.lines.join('\n');
    for (const x of [/RAMB16/, /MULT18X18/, /DCM/]) assert.match(map, x);
  });
}
