// The schematic corpus's fast part (#1687, test/schematic-corpus/): every committed schematic (the hand-made ones, the
// ISE fixtures, the gates example) loaded and saved the same, its own checks, Check Syntax of its VHDL and Verilog,
// both simulated against its reference, its ISE export imported back: each stage's status and exact warnings as
// test/schematic-corpus/expected.json records them (npm run test:schematics -- --update). The synthesis and the flow
// to a .bit, and the schematics generated from the design corpus, run in npm run test:schematics only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FAST_STAGES, STAGES, runFast, compareExpectations, updatedExpectations, stimulusOf, compareBehaviour, table } from './schematic-corpus/lib.mjs';
import { loadItems } from './schematic-corpus/items.mjs';
import { frontEnd } from './diff-synth.js';

const DIR = new URL('./schematic-corpus/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', DIR), 'utf8'));
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', DIR), 'utf8'));
const items = loadItems(manifest);

test('the manifest: every schematic with its file, a source, what it covers; the hand-made ones Silinx\'s own, each in expected.json', () => {
  const names = manifest.schematics.map(s => s.name);
  assert.equal(new Set(names).size, names.length, 'a name used twice');
  for (const s of manifest.schematics) {
    assert.ok(['hand', 'ise', 'example'].includes(s.source), s.name);
    assert.ok(s.covers, `${s.name}: what it covers`);
    assert.ok(fs.existsSync(new URL(s.file, DIR)), s.file);
    for (const f of s.ref || []) assert.ok(fs.existsSync(new URL(f, DIR)), f);
    for (const u of s.uses || []) assert.ok(names.includes(u), `${s.name} uses ${u}`);
    assert.ok(expected[s.name], `${s.name}: no expectations (npm run test:schematics -- --update)`);
    for (const st of STAGES) assert.ok(expected[s.name][st], `${s.name}: no expectation for ${st}`);
  }
  // (every hand-made schematic is in the manifest)
  const hand = fs.readdirSync(new URL('hand/', DIR)).filter(f => f.endsWith('.sch.json')).map(f => f.replace('.sch.json', ''));
  assert.deepEqual(hand.filter(h => !names.includes(h)), []);
});

for (const it of items) {
  test(`${it.name}: ${FAST_STAGES.join(', ')} as expected (statuses and warnings)`, () => {
    const r = runFast(it);
    delete r.doc;
    assert.deepEqual(compareExpectations({ [it.name]: r }, expected, FAST_STAGES), []);
  });
}

test('what the corpus covers: the bus taps, the library, the hierarchy, the drawing, ISE (each pass in every fast stage)', () => {
  const pass = n => FAST_STAGES.every(s => /^(pass|skip)/.test(expected[n][s]));
  for (const n of ['bus_taps_turned', 'bus_join', 'net_names', 'gates_inverted', 'vcc_gnd', 'arith', 'mux_dec', 'tristate', 'half_adder', 'full_adder', 'curved_hops',
    'ise-MyAND2b4', 'ise-Mux4to1b4', 'ise-list1', 'ise-Counter_2b', 'gates']) assert.ok(pass(n), n);
  // the symbols they have between them
  const types = new Set(items.flatMap(it => it.doc?.symbols.map(s => s.type) || []));
  for (const t of ['slice', 'busjoin', 'inv', 'buf', 'and2b1', 'or3b2', 'nand3b1', 'nor2', 'xor3', 'xnor2', 'and4b2', 'or5', 'vcc', 'gnd', 'constant', 'add', 'sub', 'compare',
    'mux2', 'mux4', 'mux8', 'decoder', 'encoder', 'demux', 'fd', 'fdc', 'fdce', 'fdre', 'fdpe', 'ftce', 'register', 'counter', 'bufg', 'tbuf', 'module']) assert.ok(types.has(t), t);
  // turned and mirrored taps, markers on every side, curves and crossings
  const turned = items.find(i => i.name === 'bus_taps_turned').doc;
  assert.deepEqual([...new Set(turned.symbols.map(s => `${s.rot}${s.mirror ? 'm' : ''}`))].sort(), ['0m', '180', '270', '90', '90m']);
  assert.deepEqual(turned.ports.map(p => p.side), ['N', 'S']);
  const curved = items.find(i => i.name === 'curved_hops').doc;
  assert.equal(curved.wireStyle, 'curved');
  assert.ok(curved.wires.some(w => w.curve));
});

// ------------------------------------------------------------------ the runner's own logic
test('stimulusOf: exhaustive for a small combinational design, seeded random for a clocked or wide one', () => {
  const comb = frontEnd([{ path: 'c.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity c is port (a : in std_logic_vector(2 downto 0); b : in std_logic; y : out std_logic); end c;\narchitecture r of c is begin y <= a(0) and b; end r;' }], 'c');
  const s = stimulusOf(comb.design, 'c');
  assert.equal(s.how, 'exhaustive (16)');
  assert.deepEqual(s.clocks, []);
  assert.deepEqual(new Set(s.stim.map(v => `${v.a}:${v.b}`)).size, 16);
  const seq = frontEnd([{ path: 's.v', text: 'module s(input clk, input [1:0] d, output reg [1:0] q); always @(posedge clk) q <= d; endmodule' }], 's');
  const t = stimulusOf(seq.design, 's');
  assert.deepEqual(t.clocks, ['clk']);
  assert.equal(t.how, 'random (300)');
  assert.deepEqual(stimulusOf(seq.design, 's').stim, t.stim, 'seeded by the name');
});

test('compareBehaviour: the same behaviour in two languages agrees; a wrong bit or other ports are reported', () => {
  const vhd = t => [{ path: 'm.vhd', text: `library ieee; use ieee.std_logic_1164.all;\nentity m is port (a, b : in std_logic; y : out std_logic); end m;\narchitecture r of m is begin y <= ${t}; end r;` }];
  const v = [{ path: 'm.v', text: 'module m(input a, input b, output y); assign y = a ^ b; endmodule' }];
  assert.equal(compareBehaviour({ sources: vhd('a xor b'), top: 'm' }, { sources: v, top: 'm' }, 'x'), null);
  assert.match(compareBehaviour({ sources: vhd('a xor b'), top: 'm' }, { sources: vhd('a or b'), top: 'm' }, 'x'), /^cycle 3: y$/);
  const other = [{ path: 'm.v', text: 'module m(input a, input c, output y); assign y = a ^ c; endmodule' }];
  assert.equal(compareBehaviour({ sources: vhd('a xor b'), top: 'm' }, { sources: other, top: 'm' }, 'x'), 'its ports differ from the reference\'s (b)');
});

test('compareExpectations / updatedExpectations: a changed status, a new or vanished warning; the stages that did not run kept', () => {
  const e = { s: { load: 'pass', check: 'pass', synth: 'pass', quality: { luts: 2, ffs: 0 }, warnings: { check: ['w1'] } } };
  assert.deepEqual(compareExpectations({ s: { load: 'pass', check: 'pass', warnings: { check: ['w1'] } } }, e), []);
  assert.deepEqual(compareExpectations({ s: { load: 'pass', check: 'fail: x', warnings: {} } }, e).map(d => d.stage), ['check', 'check warnings']);
  assert.deepEqual(compareExpectations({ t: { load: 'pass', warnings: {} } }, e), [{ name: 't', stage: '*', expected: 'none', got: 'new schematic' }]);
  const u = updatedExpectations(e, { s: { load: 'pass', check: 'pass', warnings: { check: ['w2'] } } });
  assert.deepEqual(u, { s: { load: 'pass', check: 'pass', synth: 'pass', quality: { luts: 2, ffs: 0 }, warnings: { check: ['w2'] } } });
  assert.match(table({ schematics: [{ name: 's', source: 'hand' }] }, u), /^\| s \| hand \| pass \| pass \| - \| - \| - \| pass \(2 \/ 0\) \| - \| 1 \|$/m);
});
