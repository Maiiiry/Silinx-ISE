// The logic of the design corpus runner (test/designs-corpus/run.mjs, npm run test:designs), on
// synthetic data: the manifest's validation, the comparison with the expectations (results and
// warnings), the warnings' normalization, the I/O and generics wrappers, the board clock's UCF, the
// quality guard (the circuits' size and speed) and the run-time baselines.
// The corpus itself (real designs, fetched) is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, compareExpectations, updatedExpectations, normalizeWarning, countWarnings, parseTime, ioWrapper, paramWrapper, boardClockUcf, isGood, kindOf, FLOW_PARTS, chipOf, deviceOf, flaggedSynth,
  qualityOf, describeQuality, compareQuality, timesOf, compareTimes, slowestTable, machineClass } from './designs-corpus/lib.mjs';
import { remoteFiles } from '../scripts/fetch-design-corpus.mjs';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { parseUcf } from '../core/ucf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'designs-corpus', 'manifest.json'), 'utf8'));
const SHA = 'a'.repeat(40);
const goodManifest = () => ({
  sources: { s: { repo: 'someone/thing', commit: SHA, url: 'https://github.com/someone/thing', licence: 'MIT', licenceFile: 'LICENSE' } },
  designs: [{ name: 'd1', source: 's', language: 'verilog', top: 't', files: ['rtl/t.v'], size: { target: 'xc3s250e' },
    testbench: { top: 'tb', files: ['tb/tb.v'], pass: 'PASS', fail: 'FAIL', until: '2 ms' } }],
});

test('the manifest of the corpus is valid; every design has a pinned source and an open-source licence', () => {
  assert.deepEqual(validateManifest(MANIFEST), []);
  for (const d of MANIFEST.designs) {
    const s = MANIFEST.sources[d.source];
    assert.match(s.commit, /^[0-9a-f]{40}$/, d.name);
    for (const f of d.files.filter(x => x.startsWith('local:'))) assert.ok(fs.existsSync(path.join(HERE, 'designs-corpus', f.slice(6))), `${d.name}: ${f}`);
  }
  // what is fetched: the design's files, its testbench's and the licence, never a local file
  const d = goodManifest();
  d.designs[0].files.push('local:wrappers/x.v');
  assert.deepEqual(remoteFiles(d, d.designs[0]).sort(), ['LICENSE', 'rtl/t.v', 'tb/tb.v']);
});

test('validateManifest: a branch instead of a commit, an unknown licence, bad paths and patterns are refused', () => {
  assert.deepEqual(validateManifest(goodManifest()), []);
  const cases = [
    [m => { m.sources.s.commit = 'master'; }, /commit must be a full commit hash/],
    [m => { m.sources.s.licence = 'proprietary'; }, /not a recognised open-source licence/],
    [m => { m.designs[0].licence = 'all rights reserved'; }, /design d1: licence/],
    [m => { m.designs[0].files = ['../etc/passwd']; }, /unsafe path/],
    [m => { m.designs[0].files = ['a.v', 'a.v']; }, /listed twice/],
    [m => { m.designs.push({ ...m.designs[0] }); }, /name used twice/],
    [m => { m.designs[0].source = 'nope'; }, /unknown source/],
    [m => { m.designs[0].size.target = 'xc7a35t'; }, /size.target/],
    [m => { m.designs[0].testbench.pass = '(['; }, /testbench pattern/],
    [m => { m.designs[0].testbench.until = 'soon'; }, /testbench.until/],
    [m => { m.designs[0].generics = { N: 'eight' }; }, /generics must be integers/],
    [m => { delete m.designs[0].top; }, /top missing/],
  ];
  for (const [f, re] of cases) {
    const m = goodManifest();
    f(m);
    assert.ok(validateManifest(m).some(p => re.test(p)), `${re}: ${validateManifest(m).join('; ')}`);
  }
});

test('compareExpectations: regressions, improvements, changes, and warnings that appear or vanish', () => {
  const expected = {
    a: { frontend: 'pass', synth: 'pass', diff: 'pass', flow: 'fail: route: 1 nets', warnings: { frontend: ['W1', 'W2 (x2)'], synth: ['Y'] } },
    b: { frontend: 'unsupported: parse: x', warnings: {} },
    c: { frontend: 'pass', flow: 'complete' },
  };
  const same = JSON.parse(JSON.stringify(expected));
  const ok = compareExpectations(expected, same, { ran: ['a', 'b', 'c'] });
  assert.equal(ok.failed, false);
  assert.deepEqual([ok.regressions, ok.improvements, ok.newWarnings, ok.vanishedWarnings], [[], [], [], []]);

  const results = {
    a: { frontend: 'pass', synth: 'pass', diff: 'mismatch: cycle 3: q', flow: 'complete', warnings: { frontend: ['W1', 'W3'], synth: ['Y'] } },
    b: { frontend: 'unsupported: elaborate: y', warnings: {} },
    d: { frontend: 'pass', warnings: {} },
  };
  const r = compareExpectations(expected, results, { ran: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(r.regressions, [{ design: 'a', stage: 'diff', expected: 'pass', got: 'mismatch: cycle 3: q' }]);
  assert.deepEqual(r.improvements, [{ design: 'a', stage: 'flow', expected: 'fail: route: 1 nets', got: 'complete' }]);
  assert.deepEqual(r.changed, [{ design: 'b', stage: 'frontend', expected: 'unsupported: parse: x', got: 'unsupported: elaborate: y' }]);
  assert.deepEqual(r.newWarnings, [{ design: 'a', stage: 'frontend', warning: 'W3' }]);
  assert.deepEqual(r.vanishedWarnings, [{ design: 'a', stage: 'frontend', warning: 'W2 (x2)' }]);
  assert.deepEqual(r.fresh, ['d']);
  assert.deepEqual(r.missing, ['c']);
  assert.equal(r.failed, true);

  // a warning only (no status change) fails the run too, either way
  const w1 = compareExpectations({ x: { frontend: 'pass' } }, { x: { frontend: 'pass', warnings: { flow: ['new'] } } });
  assert.equal(w1.failed, true);
  const w2 = compareExpectations({ x: { frontend: 'pass', warnings: { tb: ['old'] } } }, { x: { frontend: 'pass', warnings: {} } });
  assert.equal(w2.failed, true);
  // an improvement alone does not
  assert.equal(compareExpectations({ x: { flow: 'too large: 3000 slices' } }, { x: { flow: 'complete', warnings: {} } }).failed, false);
});

test('updatedExpectations: results recorded, stages that did not run and other designs kept, sorted', () => {
  const expected = { z: { frontend: 'pass' }, a: { frontend: 'pass', tb: 'pass', flow: 'complete', warnings: { tb: ['T'], flow: ['F'] } } };
  const out = updatedExpectations(expected, { a: { frontend: 'pass', flow: 'fail: x', warnings: { flow: ['G'] }, times: { flow: 5 }, details: {} } });
  assert.deepEqual(Object.keys(out), ['a', 'z']);
  assert.deepEqual(out.a, { frontend: 'pass', tb: 'pass', flow: 'fail: x', warnings: { tb: ['T'], flow: ['G'] } });
  assert.deepEqual(out.z, { frontend: 'pass' });
});

test('warnings: one line, no absolute paths or cache folders, no Yosys numbers; repeats counted', () => {
  const cache = `/home/user/src/Silinx-ISE/.cache/designs-corpus/olofk__serv/${SHA}/rtl/serv_top.v`;
  assert.equal(normalizeWarning(`Warning:  wire '\\x' in ${cache}:12\n  is   unused`), "Warning: wire '\\x' in rtl/serv_top.v:12 is unused");
  assert.equal(normalizeWarning('Warning: /tmp/build/a/b.v:3: x'), 'Warning: b.v:3: x');
  assert.equal(normalizeWarning('Warning: Replacing memory \\m with list of registers. $auto$proc_rom.cc:155:do_switch$1234'), 'Warning: Replacing memory \\m with list of registers. $auto');
  assert.equal(normalizeWarning('driver $techmap$add$22 and $flatten$7'), 'driver $techmap and $flatten');
  assert.deepEqual(countWarnings(['b', 'a', 'b', 'a', 'b']), ['a (x2)', 'b (x3)']);
  assert.deepEqual(countWarnings([]), []);
});

test('parseTime: in the simulator unit (ps); status kinds', () => {
  assert.equal(parseTime('2 ms'), 2e9);
  assert.equal(parseTime('20ns'), 20000);
  assert.equal(parseTime('1.5 us'), 1.5e6);
  assert.throws(() => parseTime('soon'));
  assert.ok(isGood('pass') && isGood('complete') && !isGood('fail: x') && !isGood(undefined));
  assert.equal(kindOf('too large: 3000 slices'), 'too large');
  assert.equal(kindOf('unsupported: parse: x'), 'unsupported');
  assert.equal(kindOf(undefined), 'none');
});

const DUT = `module dut #(parameter W = 4) (input clk, input [W-1:0] a, input [2:0] b, output reg [W-1:0] q, output y);
  always @(posedge clk) q <= a + b;
  assign y = ^a;
endmodule
`;

test('ioWrapper: the inputs loaded serially from one pin, the outputs XOR-reduced to one; elaborates and runs', () => {
  const ports = [{ name: 'clk', dir: 'in', w: 1 }, { name: 'a', dir: 'in', w: 8 }, { name: 'b', dir: 'in', w: 3 }, { name: 'q', dir: 'out', w: 8 }, { name: 'y', dir: 'out', w: 1 }];
  const wr = ioWrapper('dut', ports, { clocks: ['CLK'], generics: { W: 8 } });
  assert.match(wr.text, /reg \[10:0\] sin/);
  assert.match(wr.text, /wire \[8:0\] sout/);
  assert.match(wr.text, /dut #\(\.W\(8\)\) dut \(\.a\(sin\[7:0\]\), \.b\(sin\[10:8\]\), \.q\(sout\[7:0\]\), \.y\(sout\[8:8\]\), \.clk\(clk\)\)/);
  const tb = `module tb; reg clk = 0, din = 0; wire dout; integer i;
  corpus_io_wrap w (.clk(clk), .din(din), .dout(dout));
  always #5 clk = ~clk;
  initial begin for (i = 0; i < 11; i = i + 1) begin din = (i % 3 == 0); @(posedge clk); #1; end
    $display("sin=%b", w.sin); @(posedge clk); #1; $display("q=%h", w.dut.q); $finish; end
endmodule`;
  const lib = compile([{ path: 'dut.v', lang: 'verilog', text: DUT }, { path: 'w.v', lang: 'verilog', text: wr.text }, { path: 'tb.v', lang: 'verilog', text: tb }]);
  const des = elaborate(lib, 'tb');
  assert.deepEqual([...lib.errors, ...des.diags].filter(d => d.severity === 'error'), []);
  const sim = new Simulator(des);
  sim.run(1e6);
  const line = sim.log.filter(e => /sin=|q=/.test(e.text)).map(e => e.text).join(" ") + " ";
  // 11 bits shifted in, the first at the top: 1,0,0,1,0,0,1,0,0,1,0
  assert.match(line, /sin=10010010010 /);
  // a = sin[7:0] = 0x92, b = sin[10:8] = 4 -> q = 0x96; dout = ^{y, q} two cycles later
  assert.match(line, /q=96 /);
  // a combinational design (no clock): the wrapper still has its clock for the registers
  const comb = ioWrapper('c', [{ name: 'x', dir: 'in', w: 1 }, { name: 'z', dir: 'out', w: 2 }]);
  assert.match(comb.text, /sin <= din;/);
  assert.throws(() => ioWrapper('c', [{ name: 'io', dir: 'inout', w: 1 }]), /inout/);
});

test('paramWrapper: the same ports, the generics set', () => {
  const ports = [{ name: 'clk', dir: 'in', w: 1 }, { name: 'a', dir: 'in', w: 6 }, { name: 'b', dir: 'in', w: 3 }, { name: 'q', dir: 'out', w: 6 }, { name: 'y', dir: 'out', w: 1 }];
  const pw = paramWrapper('dut', ports, { W: 6 });
  const lib = compile([{ path: 'dut.v', lang: 'verilog', text: DUT }, { path: 'p.v', lang: 'verilog', text: pw.text }]);
  const des = elaborate(lib, pw.name);
  assert.deepEqual([...lib.errors, ...des.diags].filter(d => d.severity === 'error'), []);
  assert.deepEqual(des.top.ports.map(p => [p.name, p.dir, p.sig.t.w]), [['clk', 'in', 1], ['a', 'in', 6], ['b', 'in', 3], ['q', 'out', 6], ['y', 'out', 1]]);
});

test('boardClockUcf: the clock on B8 with a 20 ns PERIOD', () => {
  const u = parseUcf(boardClockUcf('i_Clk'));
  assert.equal(u.clocks.length, 1);
  assert.equal(u.clocks[0].net, 'i_Clk');
  assert.equal(u.clocks[0].period, 20);
  assert.match(boardClockUcf('clk'), /NET "clk" LOC = "B8" ;/);
});

test('design corpus: the devices of the flow, smallest first, each with a device description and a bit database (#7)', async () => {
  const { findDeviceGraph } = await import('../core/fpga/device-node.js');
  const { loadDb } = await import('../research/s3e-bitstream/db.mjs');
  assert.deepEqual(FLOW_PARTS.map(chipOf), ['XC3S250E', 'XC3S500E', 'XC3S1200E']);
  assert.deepEqual(deviceOf('xc3s500efg320-4'), { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' });
  assert.throws(() => deviceOf('xc6slx16csg324-3'), /not a device of the flow/);
  for (const p of FLOW_PARTS) {
    assert.ok(findDeviceGraph(p), `${p}: device description`);
    assert.ok(loadDb(p), `${p}: bit database`);
  }
  // the board clock's pad (B8) is on every package of the flow
  for (const pkg of ['cp132', 'fg320']) {
    const pads = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'research/s3e-bitstream/db', `${pkg === 'cp132' ? 'xc3s250e' : 'xc3s500e'}-${pkg}-pads.json`), 'utf8'));
    assert.ok(JSON.stringify(pads).includes('"B8"'), `B8 on the ${pkg}`);
  }
});

test('flaggedSynth: synth_xilinx options on every step, all the files the script reads (#62)', { timeout: 180000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const { toVerilog } = await import('../core/synth-verilog.js');
  const { cellCounts, SRL_MAP_FILE, SRL_CELLS_FILE } = await import('../core/synth-open.js');
  // an 8-bit shift register and a 16x4 memory
  const V = `module shmem(input clk, input d, input we, input [3:0] a, input [3:0] wd, output q, output [3:0] rd);
  reg [7:0] sh; reg [3:0] mem [0:15];
  always @(posedge clk) begin sh <= {sh[6:0], d}; if (we) mem[a] <= wd; end
  assign q = sh[7]; assign rd = mem[a];
endmodule
`;
  const { text, top } = toVerilog(elaborate(compile([{ path: 's.v', lang: 'verilog', text: V }]), 'shmem'));
  // -nosrl: no shift-register mapping of Silinx's either; the options on each synth_xilinx run
  const no = flaggedSynth(top, text, '-nobram -nolutram -nosrl');
  const script = no.args[2];
  assert.deepEqual(no.args.slice(0, 2), ['-q', '-p']);
  assert.equal(script.match(/synth_xilinx /g).length, script.match(/synth_xilinx -nobram -nolutram -nosrl -family xc3se /g).length);
  assert.doesNotMatch(script, /xilinx_srl|silinx_srl/);
  assert.deepEqual(Object.keys(no.files).sort(), [SRL_CELLS_FILE, SRL_MAP_FILE, 'shmem_syn.v'].sort());
  // without -nosrl: the script reads the SRL cells, which Yosys did not find before (#62)
  const keep = flaggedSynth(top, text, '-nobram');
  assert.match(keep.args[2], new RegExp(`read_verilog -lib ${SRL_CELLS_FILE}`));
  assert.equal(keep.args[2].match(/synth_xilinx /g).length, keep.args[2].match(/synth_xilinx -nobram -family xc3se /g).length);
  assert.deepEqual(Object.keys(keep.files).sort(), [SRL_CELLS_FILE, SRL_MAP_FILE, 'shmem_syn.v'].sort());
  // both run in Yosys; the only warning is the one Yosys prints on every Spartan-3E run
  const run = async ({ args, files }) => {
    const lines = [];
    const out = await yosysNode(args, files, l => lines.push(l));
    return { cells: cellCounts(out[`${top}.json`], top), warnings: lines.filter(l => /^Warning/.test(l)) };
  };
  const a = await run(no), b = await run(keep);
  assert.deepEqual(a.warnings, ['Warning: Shift register inference not yet supported for family xc3se.']);
  assert.deepEqual(b.warnings, ['Warning: Shift register inference not yet supported for family xc3se.']);
  assert.equal(a.cells.SRL16E, undefined);
  assert.equal(a.cells.RAM16X1S, undefined);
  assert.equal(a.cells.FDRE, 8 + 64);
  assert.equal(b.cells.SRL16E, 1);
  assert.equal(b.cells.RAM16X1S, 4);
});

const Q = (o = {}) => ({ part: 'xc3s250ecp132-4', slices: 200, luts: 400, ffs: 100, period: 10, ...o });

test('qualityOf: the packed size and the worst clock\'s period by the STA, null without a clock', () => {
  assert.deepEqual(qualityOf('xc3s250ecp132-4', { slices: 131, luts: 259, ffs: 79, other: 1 }, [{ clock: 'a', period: 5.6254 }, { clock: 'b', period: 4 }]),
    { part: 'xc3s250ecp132-4', slices: 131, luts: 259, ffs: 79, period: 5.625 });
  assert.equal(qualityOf('xc3s250ecp132-4', { slices: 1, luts: 2, ffs: 0 }, []).period, null);
  assert.equal(describeQuality(Q()), '200 slices, 400 LUTs, 100 FFs, 10.000 ns on the xc3s250ecp132-4');
  assert.equal(describeQuality(Q({ period: null })), '200 slices, 400 LUTs, 100 FFs on the xc3s250ecp132-4');
});

test('compareQuality: larger or slower beyond the tolerance fails, within it is noise, smaller / faster listed', () => {
  const expected = { a: { flow: 'complete', quality: Q() }, b: { flow: 'complete', quality: Q() }, c: { flow: 'complete', quality: Q() } };
  // within the tolerance (5% size, 15% critical path), either way: nothing
  const within = compareQuality(expected, { a: { quality: Q({ slices: 210, luts: 380, ffs: 105, period: 11.4 }) }, b: { quality: Q({ period: 8.6 }) } });
  assert.deepEqual(within, { worse: [], better: [], moved: [], fresh: [], failed: false });
  // beyond it: larger and slower fail, smaller and faster are improvements; a flow that did not
  // complete has no quality (its status is the regression)
  const r = compareQuality(expected, {
    a: { quality: Q({ slices: 211, luts: 380, period: 11.6 }) },
    b: { quality: Q({ ffs: 90, period: 8.4 }) },
    c: { flow: 'fail: route: x' },
  });
  assert.equal(r.failed, true);
  assert.deepEqual(r.worse.map(x => x.message), ['a: slices 200 -> 211 (+5.5%, tolerance 5.0%)', 'a: critical path 10.000 -> 11.600 ns (+16.0%, tolerance 15.0%)']);
  assert.deepEqual(r.worse.map(x => [x.design, x.metric, x.expected, x.got]), [['a', 'slices', 200, 211], ['a', 'period', 10, 11.6]]);
  assert.deepEqual(r.better.map(x => x.message), ['b: flip-flops 100 -> 90 (-10.0%)', 'b: critical path 10.000 -> 8.400 ns (-16.0%)']);
  // an improvement alone does not fail
  const imp = compareQuality(expected, { b: { quality: Q({ luts: 300 }) } });
  assert.equal(imp.failed, false);
  assert.deepEqual(imp.better.map(x => x.message), ['b: LUTs 400 -> 300 (-25.0%)']);
  // the caller's tolerance (--size-tolerance 10): 211 slices is within, 221 not
  assert.equal(compareQuality(expected, { a: { quality: Q({ slices: 211 }) } }, { slices: 0.1 }).failed, false);
  assert.deepEqual(compareQuality(expected, { a: { quality: Q({ slices: 221 }) } }, { slices: 0.1 }).worse.map(x => x.message), ['a: slices 200 -> 221 (+10.5%, tolerance 10.0%)']);
});

test('compareQuality: no recorded quality, another device, no clock: listed, never a failure', () => {
  const expected = { a: { flow: 'complete', quality: Q() }, n: { flow: 'complete', quality: Q({ period: null }) }, old: { flow: 'complete' } };
  const r = compareQuality(expected, {
    fresh: { quality: Q() },
    old: { quality: Q({ period: null }) },
    a: { quality: Q({ part: 'xc3s500efg320-4', slices: 400 }) },
    n: { quality: Q({ period: null, ffs: 120 }) },
  });
  assert.deepEqual(r.fresh.map(x => x.message), [
    'fresh: no recorded quality (200 slices, 400 LUTs, 100 FFs, 10.000 ns on the xc3s250ecp132-4): --update records it',
    'old: no recorded quality (200 slices, 400 LUTs, 100 FFs on the xc3s250ecp132-4): --update records it']);
  assert.deepEqual(r.moved.map(x => x.message), ['a: built on the xc3s500efg320-4, recorded on the xc3s250ecp132-4: not compared']);
  assert.deepEqual(r.worse.map(x => x.message), ['n: flip-flops 100 -> 120 (+20.0%, tolerance 5.0%)']);
  assert.deepEqual(r.better, []);
});

test('updatedExpectations: the quality recorded when the flow ran, dropped when it did not complete, kept when it did not run', () => {
  const expected = { a: { flow: 'complete', quality: Q() }, b: { flow: 'complete', quality: Q() }, c: { flow: 'complete', quality: Q() } };
  const out = updatedExpectations(expected, {
    a: { flow: 'complete', quality: Q({ slices: 150 }), warnings: {} },
    b: { flow: 'fail: route: x', warnings: {} },
    c: { frontend: 'pass', warnings: {} },
  });
  assert.equal(out.a.quality.slices, 150);
  assert.equal(out.b.quality, undefined);
  assert.deepEqual(out.c.quality, Q());
});

test('run times: a synthesis or a flow 1.5x and 30 s slower than its baseline warns; the slowest designs as a table', () => {
  const results = {
    a: { times: { frontend: 100, synth: 10000, diff: 500, flow: 100000 } },
    b: { times: { frontend: 100, synth: 50000, flow: 5000 } },
    c: { times: { frontend: 100, synth: 2000, flow: 1000 } },
    z: { times: {} },
  };
  assert.deepEqual(timesOf(results), {
    a: { synth: 10000, flow: 100000, total: 110600 },
    b: { synth: 50000, flow: 5000, total: 55100 },
    c: { synth: 2000, flow: 1000, total: 3100 },
  });
  const baseline = { a: { synth: 9000, flow: 60000, total: 70000 }, b: { synth: 20000, flow: 1000, total: 21000 } };
  const r = compareTimes(baseline, results);
  // a's flow: x1.7 and 40 s longer; b's synthesis: x2.5 but exactly 30 s longer; b's flow: x5 but 4 s
  assert.deepEqual(r.warnings.map(x => x.message), ['a flow: 100 s, baseline 60 s (x1.7)']);
  assert.deepEqual(r.unknown, ['c']);
  assert.deepEqual(compareTimes(baseline, { b: { times: { synth: 50001 } } }).warnings.map(x => x.message), ['b synth: 50 s, baseline 20 s (x2.5)']);
  // within 1.5x, however much longer: nothing
  assert.deepEqual(compareTimes({ a: { flow: 600000 } }, { a: { times: { flow: 890000 } } }).warnings, []);
  // no baseline at all (a new machine class)
  assert.deepEqual(compareTimes(undefined, results), { warnings: [], unknown: ['a', 'b', 'c'] });
  assert.deepEqual(slowestTable(results, baseline, 2), [
    'design                   frontend       tb    synth     diff     flow    total baseline',
    'a                               0        -       10        1      100      111       70',
    'b                               0        -       50        -        5       55       21',
  ]);
});

test('machineClass: --machine, SILINX_CORPUS_MACHINE, ci on a CI runner, else local', () => {
  assert.equal(machineClass('m1', { CI: 'true' }), 'm1');
  assert.equal(machineClass(null, { SILINX_CORPUS_MACHINE: 'mini', CI: 'true' }), 'mini');
  assert.equal(machineClass(null, { CI: 'true' }), 'ci');
  assert.equal(machineClass(null, {}), 'local');
});

test('the corpus\'s quality expectations and time baselines are well formed', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(HERE, 'designs-corpus', 'expected.json'), 'utf8'));
  for (const [d, e] of Object.entries(expected)) {
    if (!e.quality) continue;
    assert.match(e.flow, /^complete/, `${d}: a quality without a complete flow`);
    assert.ok(FLOW_PARTS.includes(e.quality.part), `${d}: ${e.quality.part}`);
    for (const k of ['slices', 'luts', 'ffs']) assert.ok(Number.isInteger(e.quality[k]), `${d}: ${k}`);
    assert.ok(e.quality.period === null || e.quality.period > 0, `${d}: period`);
  }
  const file = path.join(HERE, 'designs-corpus', 'times.json');
  const times = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const [m, t] of Object.entries(times)) for (const [d, x] of Object.entries(t)) assert.ok(x.total >= 0 && expected[d], `${m} ${d}`);
});
