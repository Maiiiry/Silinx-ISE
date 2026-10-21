// The Clocking Wizard's modules (#793, core/clocking.js): the DCM_SP's and the PLL's parameters against the data
// sheets' equations and ranges (DS312 Tables 104-107, DS162 Table 52), the modules in VHDL and Verilog compiled,
// elaborated with no warnings and simulated (every output's period and phase measured once LOCKED rises), the spec read
// back from the module's header.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { CLKDV_DIVIDES, DCM_PINS, clockModule, dcmLimits, dvChoices, fxChoices, planClock, pllLimits, readWizardSpec, wizardLine } from '../core/clocking.js';

const dcmSpec = (o = {}) => ({ wizard: 'clock', version: 1, name: 'clkgen', lang: 'vhdl', family: 'spartan3e', speed: '-4', inMHz: 50, input: 'clk_in', ibufg: true,
  reset: 'rst', locked: 'locked', div2: false, phaseShift: 0, outputs: [{ pin: 'CLK0', port: 'clk0' }], ...o });
const pllSpec = (o = {}) => ({ wizard: 'clock', version: 1, name: 'clkgen', lang: 'vhdl', family: 'spartan6', speed: '-3', inMHz: 100, input: 'clk_in', ibufg: true,
  reset: 'rst', locked: 'locked', outputs: [{ port: 'clk_a', mhz: 100 }], ...o });
const gen = (plan, n) => plan.generics.find(g => g[0] === n)?.[1];

test('the DCM_SP\'s ranges: DS312 Tables 104-107 (Stepping 1), -4 and -5', () => {
  assert.deepEqual(dcmLimits('-4'), { dllIn: [5, 240], dfsIn: [0.2, 333], clk0: [5, 240], clk90: [5, 200], clk2x: [10, 311], clkdv: [0.3125, 160], clkfx: [5, 311] });
  assert.deepEqual(dcmLimits('-5'), { dllIn: [5, 275], dfsIn: [0.2, 333], clk0: [5, 275], clk90: [5, 200], clk2x: [10, 333], clkdv: [0.3125, 183], clkfx: [5, 333] });
  assert.deepEqual(CLKDV_DIVIDES.length, 22);
  // DS162 Table 52 (the input from a global buffer, the outputs on BUFGs)
  assert.deepEqual(pllLimits('-3'), { in: [19, 400], vco: [400, 1080], pfd: [19, 500], out: [3.125, 400], mult: [1, 64], div: [1, 52], odiv: [1, 128] });
  assert.deepEqual([pllLimits('-2').in, pllLimits('-2').vco, pllLimits('-2').pfd, pllLimits('-2').out], [[19, 375], [400, 1000], [19, 400], [3.125, 375]]);
  assert.deepEqual([pllLimits('-1L').vco[1], pllLimits('-1L').pfd[1], pllLimits('-3N').vco[1]], [1000, 300, 1050]);
});

test('CLKFX: the nearest frequency to the one asked, M 2-32 and D 1-32, each frequency once with its smallest M and D', () => {
  // an exact one: 50 x 13 / 10 = 65 MHz (not 26 / 20), then the next nearest
  assert.deepEqual(fxChoices(50, 65), [{ m: 13, d: 10, mhz: 65 }, { m: 30, d: 23, mhz: 65.217391 }, { m: 22, d: 17, mhz: 64.705882 },
    { m: 17, d: 13, mhz: 65.384615 }, { m: 31, d: 24, mhz: 64.583333 }]);
  assert.deepEqual(fxChoices(50, 25, { n: 1 }), [{ m: 2, d: 4, mhz: 25 }]);
  // against brute force: every pair's frequency, none nearer than the chosen one, all in range
  for (const [f, want] of [[50, 33.3], [50, 7], [100, 147.456], [32, 300], [50, 400], [50, 1]]) {
    const [c] = fxChoices(f, want, { n: 1 });
    for (let d = 1; d <= 32; d++) {
      for (let m = 2; m <= 32; m++) {
        const x = f * m / d;
        if (x >= 5 && x <= 311) assert.ok(Math.abs(x - want) >= Math.abs(c.mhz - want) - 1e-6, `${f} x ${m} / ${d} nearer ${want} than ${c.mhz}`);
      }
    }
    assert.ok(c.mhz >= 5 && c.mhz <= 311, `${f} -> ${want}: ${c.mhz} in range`);
    assert.equal(Math.round(f * c.m / c.d * 1e6) / 1e6, c.mhz);
  }
  // (out of range asked: the nearest end)
  assert.deepEqual(fxChoices(50, 400, { n: 1 }), [{ m: 31, d: 5, mhz: 310 }]);
  // CLKIN_DIVIDE_BY_2: trce's halved limits, its lowest frequency doubled (10 MHz)
  assert.ok(fxChoices(25, 5, { div2: true }).every(c => c.mhz >= 10));
});

test('CLKDV: the divides of DS312 in range; 50 MHz / 16 = 3.125 MHz, on -4 not above 160 MHz', () => {
  assert.deepEqual(dvChoices(50).map(c => c.divide), CLKDV_DIVIDES);
  assert.deepEqual(dvChoices(240).map(c => c.divide), CLKDV_DIVIDES);   // 240 / 1.5 = 160 is the end itself
  assert.deepEqual(dvChoices(241).map(c => c.divide), CLKDV_DIVIDES.slice(1));
  assert.deepEqual(dvChoices(241, { speed: '-5' }).map(c => c.divide), CLKDV_DIVIDES);
  assert.deepEqual(dvChoices(50).at(-1), { divide: 16, mhz: 3.125 });
});

test('a DCM plan: every output\'s frequency and the generics, the nearest CLKDV and CLKFX chosen', () => {
  const p = planClock(dcmSpec({ outputs: [{ pin: 'CLK0', port: 'clk0' }, { pin: 'CLK90', port: 'clk90' }, { pin: 'CLK2X', port: 'clk2x' },
    { pin: 'CLKDV', port: 'clkdv', mhz: 12 }, { pin: 'CLKFX', port: 'clkfx', mhz: 33.33 }, { pin: 'CLKFX180', port: 'clkfx180' }] }));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.outputs.map(o => [o.pin, o.mhz, o.period]), [['CLK0', 50, 20], ['CLK90', 50, 20], ['CLK2X', 100, 10], ['CLKDV', 12.5, 80],
    ['CLKFX', 33.333333, 30], ['CLKFX180', 33.333333, 30]]);
  assert.deepEqual(p.generics, [['CLKDV_DIVIDE', '4.0'], ['CLKFX_MULTIPLY', '2'], ['CLKFX_DIVIDE', '3'], ['CLKIN_DIVIDE_BY_2', 'FALSE'],
    ['CLKIN_PERIOD', '20.000'], ['CLKOUT_PHASE_SHIFT', '"NONE"'], ['CLK_FEEDBACK', '"1X"'], ['DESKEW_ADJUST', '"SYSTEM_SYNCHRONOUS"'],
    ['DFS_FREQUENCY_MODE', '"LOW"'], ['DLL_FREQUENCY_MODE', '"LOW"'], ['DUTY_CYCLE_CORRECTION', 'TRUE'], ['PHASE_SHIFT', '0'], ['STARTUP_WAIT', 'FALSE']]);
  assert.deepEqual(p.outputs.map(o => o.note), ['CLKIN', 'CLKIN, 90°', 'CLKIN x 2', 'CLKIN / 4', 'CLKIN x 2 / 3', 'CLKIN x 2 / 3, 180°']);
  // CLKDV 12 MHz asked: 12.5 (/ 4) is nearer than 11.111 (/ 4.5)
  assert.equal(p.outputs[3].asked, 12);
  // a fixed phase shift: PHASE_SHIFT / 256 of the period
  const q = planClock(dcmSpec({ phaseShift: 64 }));
  assert.deepEqual([gen(q, 'CLKOUT_PHASE_SHIFT'), gen(q, 'PHASE_SHIFT')], ['"FIXED"', '64']);
  assert.deepEqual(q.notes, ['Phase shift: 64 / 256 of the CLKIN period (90.0°, 5.000 ns), on every output.']);
  // the input divided by 2: 100 MHz in, 50 MHz at CLK0
  const r = planClock(dcmSpec({ inMHz: 100, div2: true, outputs: [{ pin: 'CLK0', port: 'c' }, { pin: 'CLKFX', port: 'f', mhz: 75 }] }));
  assert.deepEqual([r.errors, r.outputs.map(o => o.mhz), gen(r, 'CLKIN_DIVIDE_BY_2'), gen(r, 'CLKIN_PERIOD'), gen(r, 'CLKFX_MULTIPLY'), gen(r, 'CLKFX_DIVIDE')],
    [[], [50, 75], 'TRUE', '10.000', '3', '2']);
});

test('a DCM plan\'s errors: the exact messages, out of each range of DS312', () => {
  const errs = o => planClock(dcmSpec(o)).errors;
  assert.deepEqual(errs({ inMHz: 0 }), ['Enter the input clock frequency.']);
  assert.deepEqual(errs({ inMHz: 300 }), ['The DCM\'s input (300.000 MHz) is out of the DLL\'s range, 5 to 240 MHz: divide the input by 2.', 'CLK0 (300.000 MHz) is out of its range, 5 to 240 MHz.']);
  assert.deepEqual(errs({ inMHz: 300, speed: '-5' }).slice(0, 1), ['The DCM\'s input (300.000 MHz) is out of the DLL\'s range, 5 to 275 MHz: divide the input by 2.']);
  assert.deepEqual(errs({ inMHz: 4 }), ['The DCM\'s input (4.000 MHz) is out of the DLL\'s range, 5 to 240 MHz.', 'CLK0 (4.000 MHz) is out of its range, 5 to 240 MHz.']);
  assert.deepEqual(errs({ inMHz: 210, outputs: [{ pin: 'CLK90', port: 'a' }] }), ['CLK90 (210.000 MHz) is out of its range, 5 to 200 MHz.']);
  assert.deepEqual(errs({ inMHz: 160, outputs: [{ pin: 'CLK2X', port: 'a' }] }), ['CLK2X (320.000 MHz) is out of its range, 10 to 311 MHz.']);
  assert.deepEqual(errs({ inMHz: 160, outputs: [{ pin: 'CLK2X', port: 'a' }], speed: '-5' }), []);
  assert.deepEqual(errs({ outputs: [] }), ['Choose at least one output.']);
  assert.deepEqual(errs({ outputs: [{ pin: 'CLKFX', port: 'a', mhz: '' }] }), ['Enter the frequency of CLKFX.']);
  assert.deepEqual(errs({ outputs: [{ pin: 'CLKDV', port: 'a' }] }), ['Enter the frequency of CLKDV.']);
  assert.deepEqual(errs({ phaseShift: 256 }), ['The phase shift is from -255 to 255 (256ths of the period).']);
  // CLKIN_DIVIDE_BY_2: CLK0 at 6 MHz is under trce's 10 MHz (its limits halved)
  assert.deepEqual(errs({ inMHz: 12, div2: true }), ['CLK0 (6.000 MHz) is out of its range, 10 to 240 MHz.']);
  assert.deepEqual(errs({ inMHz: 8, div2: true }), ['The DCM\'s input (4.000 MHz, the input divided by 2) is out of the DLL\'s range, 5 to 240 MHz.',
    'With the input divided by 2, the input must be at least 10 MHz.', 'CLK0 (4.000 MHz) is out of its range, 10 to 240 MHz.']);
});

test('a PLL plan: the VCO in range, each output VCO / divide, the nearest found against brute force (DS162, UG382)', () => {
  const p = planClock(pllSpec({ outputs: [{ port: 'a', mhz: 25 }, { port: 'b', mhz: 50, phase: 90 }, { port: 'c', mhz: 200 }] }));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.outputs.map(o => [o.pin, o.port, o.mhz, o.phase]), [['CLKOUT0', 'a', 25, 0], ['CLKOUT1', 'b', 50, 90], ['CLKOUT2', 'c', 200, 0]]);
  // exact: the fastest VCO, 1000 MHz (100 x 10 / 1)
  assert.deepEqual([p.vco, p.mult, p.div, gen(p, 'CLKFBOUT_MULT'), gen(p, 'DIVCLK_DIVIDE'), gen(p, 'CLKOUT0_DIVIDE'), gen(p, 'CLKOUT1_DIVIDE'), gen(p, 'CLKOUT2_DIVIDE'), gen(p, 'CLKIN_PERIOD')],
    [1000, 10, 1, '10', '1', '40', '20', '5', '10.000']);
  assert.deepEqual([gen(p, 'CLKOUT1_PHASE'), gen(p, 'CLKOUT3_DIVIDE'), gen(p, 'COMPENSATION'), gen(p, 'CLK_FEEDBACK')], ['90.000', '1', '"INTERNAL"', '"CLKFBOUT"']);
  // the phase in steps of 45 / divide degrees (an eighth of the VCO period): / 5 -> 9°
  const q = planClock(pllSpec({ outputs: [{ port: 'a', mhz: 200, phase: 50 }] }));
  assert.equal(q.outputs[0].phase, 54);
  // brute force over every (M, D, O): none with a smaller error than the plan's for one output
  for (const [fin, want, speed] of [[100, 65, '-3'], [50, 148.5, '-3'], [100, 33.333, '-2'], [27, 74.25, '-3'], [100, 3.2, '-1L']]) {
    const r = planClock(pllSpec({ inMHz: fin, speed, outputs: [{ port: 'a', mhz: want }] }));
    assert.deepEqual(r.errors, []);
    const L = pllLimits(speed);
    let bestErr = Infinity;
    for (let d = 1; d <= 52; d++) {
      for (let m = 1; m <= 64; m++) {
        const pfd = fin / d, vco = pfd * m;
        if (pfd < 19 || pfd > L.pfd[1] || vco < 400 || vco > L.vco[1]) continue;
        for (let o = 1; o <= 128; o++) if (vco / o >= 3.125 && vco / o <= L.out[1]) bestErr = Math.min(bestErr, Math.abs(vco / o - want));
      }
    }
    assert.ok(Math.abs(r.outputs[0].mhz - want) <= bestErr + 1e-6, `${fin} -> ${want} (${speed}): ${r.outputs[0].mhz}, best ${bestErr}`);
    assert.ok(r.vco >= 400 && r.vco <= L.vco[1] && fin / r.div >= 19 && fin / r.div <= L.pfd[1], `${fin} -> ${want}: VCO ${r.vco}, PFD ${fin / r.div}`);
  }
  // errors
  const errs = o => planClock(pllSpec(o)).errors;
  assert.deepEqual(errs({ inMHz: 10 }), ['The PLL\'s input (10.000 MHz) is out of its range, 19 to 400 MHz.']);
  assert.deepEqual(errs({ outputs: [{ port: 'a', mhz: 500 }] }), ['a (500.000 MHz) is out of the PLL\'s output range, 3.125 to 400 MHz.']);
  assert.deepEqual(errs({ outputs: [{ port: 'a', mhz: 390 }], speed: '-2' }), ['a (390.000 MHz) is out of the PLL\'s output range, 3.125 to 375 MHz.']);
  assert.deepEqual(errs({ outputs: Array.from({ length: 7 }, (_, i) => ({ port: `c${i}`, mhz: 50 })) }), ['A PLL has 6 outputs.']);
  assert.deepEqual(errs({ outputs: [{ port: 'a', mhz: 0 }] }), ['Enter the frequency of a.']);
});

test('the spec in the module\'s header, read back; a module not made by the wizard has none', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const spec = dcmSpec({ lang, outputs: [{ pin: 'CLK0', port: 'clk0' }, { pin: 'CLKFX', port: 'fx', mhz: 65 }] });
    const { code } = clockModule(spec);
    assert.ok(code.startsWith(wizardLine(spec, lang)));
    assert.deepEqual(readWizardSpec(code), spec);
  }
  assert.equal(readWizardSpec('entity a is end a;'), null);
  assert.equal(readWizardSpec('-- silinx-wizard: {broken'), null);
  assert.equal(readWizardSpec('-- silinx-wizard: {"x":1}'), null);
  assert.deepEqual(clockModule(dcmSpec({ inMHz: 0 })), { code: '', plan: planClock(dcmSpec({ inMHz: 0 })) });
});

// ------------------------------------------------------------------ simulation
// a test bench of a clock module: the input at its frequency (a half period in whole picoseconds), each output's
// period measured over `n` rising edges once LOCKED has risen (and two edges more), reported "<port> <ps>", and the time
// of the first of them, "<port>@ <ps>"
function vhdlBench(spec, plan, n) {
  const half = Math.round(500000 / spec.inMHz);
  const outs = plan.outputs.map(o => o.port);
  return `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity tb is end tb;
architecture sim of tb is
  signal ${spec.input} : std_logic := '0';
  signal ${spec.reset} : std_logic := '1';
  signal ${[...outs, spec.locked].join(', ')} : std_logic;
begin
  ${spec.input} <= not ${spec.input} after ${half} ps;
  ${spec.reset} <= '0' after ${4 * half * 2} ps;
  uut : entity work.${spec.name} port map (${[spec.input, spec.reset, ...outs, spec.locked].map(p => `${p} => ${p}`).join(', ')});
  process begin wait until ${spec.locked} = '1'; report "locked " & integer'image(now / 1 ps); wait; end process;
${outs.map(p => `  process
    variable t : time;
  begin
    wait until ${spec.locked} = '1';
    wait until rising_edge(${p}); wait until rising_edge(${p});
    t := now;
    for i in 1 to ${n} loop wait until rising_edge(${p}); end loop;
    report "${p} " & integer'image((now - t) / 1 ps);
    report "${p}@ " & integer'image(t / 1 ps);
    wait;
  end process;`).join('\n')}
end sim;`;
}
function verilogBench(spec, plan, n) {
  const half = Math.round(500000 / spec.inMHz);
  const outs = plan.outputs.map(o => o.port);
  return `\`timescale 1ps / 1ps
module tb;
  reg ${spec.input} = 0, ${spec.reset} = 1;
  wire ${[...outs, spec.locked].join(', ')};
  always #${half} ${spec.input} = ~${spec.input};
  initial #${8 * half} ${spec.reset} = 0;
  ${spec.name} uut (${[spec.input, spec.reset, ...outs, spec.locked].map(p => `.${p}(${p})`).join(', ')});
  initial begin wait (${spec.locked} === 1'b1); $display("locked %0d", $time); end
${outs.map(p => `  initial begin : m_${p}
    integer i; time t;
    wait (${spec.locked} === 1'b1);
    @(posedge ${p}); @(posedge ${p});
    t = $time;
    for (i = 0; i < ${n}; i = i + 1) @(posedge ${p});
    $display("${p} %0d", $time - t);
    $display("${p}@ %0d", t);
  end`).join('\n')}
endmodule`;
}
// the module and its bench simulated: no warnings at compilation and elaboration, the reports
function simulateClock(spec, n, until = 20e6) {
  const { code, plan } = clockModule(spec);
  assert.deepEqual(plan.errors, []);
  const v = spec.lang === 'verilog';
  const sources = [{ path: `src/${spec.name}.${v ? 'v' : 'vhd'}`, text: code }, { path: `sim/tb.${v ? 'v' : 'vhd'}`, text: (v ? verilogBench : vhdlBench)(spec, plan, n) }];
  const r = simulate([...primitiveSources(sources), ...sources], 'tb', { until });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line}: ${e.message}`), [], 'compile errors');
  const warnings = [...(r.lib?.errors || []), ...(r.design?.diags || [])].filter(d => d.file?.startsWith('src/') || d.file?.startsWith('sim/')).map(d => `${d.file}:${d.line}: ${d.message}`);
  assert.deepEqual(warnings, [], 'no warnings');
  const out = Object.fromEntries(r.sim.log.filter(l => /^[\w@]+ \d+$/.test(l.text)).map(l => l.text.split(' ')).map(([k, x]) => [k, +x]));
  return { out, plan };
}

for (const lang of ['vhdl', 'verilog']) {
  test(`a DCM_SP module simulated (${lang}): every output's period, LOCKED after the reset`, () => {
    const spec = dcmSpec({ lang, outputs: [{ pin: 'CLK0', port: 'clk0' }, { pin: 'CLK90', port: 'clk90' }, { pin: 'CLK2X', port: 'clk2x' },
      { pin: 'CLKDV', port: 'clkdv', mhz: 12.5 }, { pin: 'CLKFX', port: 'clkfx', mhz: 65 }, { pin: 'CLKFX180', port: 'clkfx180' }] });
    // 13 edges of CLKFX (x 13 / 10) span 10 input periods exactly: 200 ns
    const { out, plan } = simulateClock(spec, 13);
    assert.deepEqual(plan.outputs.map(o => o.period), [20, 20, 10, 80, 15.385, 15.385]);
    const periods = Object.fromEntries(Object.entries(out).filter(([k]) => !/@$|^locked$/.test(k)));
    assert.deepEqual(periods, { clk0: 13 * 20000, clk90: 13 * 20000, clk2x: 13 * 10000, clkdv: 13 * 80000, clkfx: 200000, clkfx180: 200000 });
    // CLK90 a quarter of the period after CLK0; CLKFX180 half of CLKFX's from it (before or after: which edge each
    // bench's count starts from differs by a delta between the languages)
    assert.equal(out['clk90@'] - out['clk0@'], 5000);
    assert.equal(Math.abs(out['clkfx180@'] - out['clkfx@']), 7692);
    // LOCKED: at the third rising edge of the input after the reset (80 ns): 90, 110, 130 ns
    assert.equal(out.locked, 130000);
  });
  test(`a DCM_SP module with the input divided by 2, no IBUFG; one without its reset (${lang})`, () => {
    const spec = dcmSpec({ lang, inMHz: 100, div2: true, ibufg: false, outputs: [{ pin: 'CLK0', port: 'c0' }, { pin: 'CLKFX', port: 'fx', mhz: 125 }] });
    const { code } = clockModule({ ...spec, reset: '' });
    assert.doesNotMatch(code, /IBUFG/);
    assert.match(code, lang === 'vhdl' ? /RST +=> '0'/ : /\.RST +\(1'b0\)/);
    const { out } = simulateClock(spec, 5);
    // 50 MHz at CLK0; CLKFX x 5 / 2 of it: 125 MHz, 5 edges in 40 ns
    assert.deepEqual({ c0: out.c0, fx: out.fx }, { c0: 5 * 20000, fx: 40000 });
  });
}

// Spartan-6: the PLL_BASE module (its model: core/unisim-s6.js, #791) simulated in both languages, its parameters in its text
for (const lang of ['vhdl', 'verilog']) {
  test(`a PLL_BASE module simulated (Spartan-6, ${lang}): each output's period, a 90° phase, LOCKED after the reset`, () => {
    // (exact at the fastest VCO: 100 x 21 / 2 = 1050 MHz, / 42 and / 21)
    const spec = pllSpec({ lang, outputs: [{ port: 'clk_a', mhz: 25 }, { port: 'clk_b', mhz: 50, phase: 90 }] });
    const { code } = clockModule(spec);
    const g = lang === 'vhdl' ? (n, v) => new RegExp(`${n} +=> ${v.replace(/[.()]/g, '\\$&')}[,\\n]`) : (n, v) => new RegExp(`\\.${n} *\\(${v.replace(/[.()]/g, '\\$&')}\\)`);
    for (const [n, v] of [['CLKFBOUT_MULT', '21'], ['DIVCLK_DIVIDE', '2'], ['CLKOUT0_DIVIDE', '42'], ['CLKOUT1_DIVIDE', '21'], ['CLKOUT1_PHASE', '90.000'], ['CLKIN_PERIOD', '10.000']]) {
      assert.match(code, g(n, v), `${lang}: ${n}`);
    }
    assert.match(code, lang === 'vhdl' ? /CLKFBIN +=> clkfb_u,\n +RST +=> rst,\n +CLKFBOUT +=> clkfb_u,/ : /\.CLKFBIN +\(clkfb_u\),\n +\.RST +\(rst\),\n +\.CLKFBOUT *\(clkfb_u\),/);
    // a BUFG on each output
    assert.deepEqual([...code.matchAll(lang === 'vhdl' ? /^ {2}(\w+) : BUFG port map \(I => (\w+), O => (\w+)\);$/gm : /^ {2}BUFG (\w+) \(\.I\((\w+)\), \.O\((\w+)\)\);$/gm)].map(m => m.slice(1)),
      [['u_bufg_clkout0', 'clkout0_u', 'clk_a'], ['u_bufg_clkout1', 'clkout1_u', 'clk_b']]);
    const { out } = simulateClock(spec, 21, 40e6);
    assert.deepEqual({ clk_a: out.clk_a, clk_b: out.clk_b }, { clk_a: 21 * 40000, clk_b: 21 * 20000 });
    // clk_b 90° (5 ns) after clk_a's edges (both from the same aligned edge)
    assert.equal(((out['clk_b@'] - out['clk_a@']) % 20000 + 20000) % 20000, 5000);
    // LOCKED: at the third rising edge of the input after the reset (40 ns, the input's period 10 ns): 45, 55, 65 ns
    assert.equal(out.locked, 65000);
  });
}
