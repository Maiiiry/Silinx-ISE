// The logic of the design corpus runner (test/designs-corpus/run.mjs, npm run test:designs), on
// synthetic data: the manifest's validation, the comparison with the expectations (results and
// warnings), the warnings' normalization, the I/O and generics wrappers, the board clock's UCF.
// The corpus itself (real designs, fetched) is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, compareExpectations, updatedExpectations, normalizeWarning, countWarnings, parseTime, ioWrapper, paramWrapper, boardClockUcf, isGood, kindOf, FLOW_PARTS, chipOf, deviceOf } from './designs-corpus/lib.mjs';
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
