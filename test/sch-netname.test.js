// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #689: two wires with the same net name are one net, connected by name without a wire drawn between them
// (as in ISE, and as the gates example uses it); netByName finds the net a new name would join, so that
// the editor asks before joining them. The generated VHDL and Verilog have a single signal, and simulate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate } from '../core/compile.js';
import { newDoc, netlist, generateHdl, netByName, renameNet } from '../core/schdoc.js';

const P = (x, y) => ({ x, y });
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
// a -> U1 -> a wire named s; another wire named s, not drawn to it -> U2 -> y: y = a
function byName(lang, second = 's') {
  const doc = newDoc('byname', lang);
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 100, 290));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 220, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(100, 100)] }, { id: 'W2', points: [P(160, 100), P(220, 100)] },
    { id: 'W3', points: [P(40, 300), P(100, 300)] }, { id: 'W4', points: [P(160, 300), P(220, 300)] });
  doc.labels.push({ id: 'L1', x: 200, y: 100, net: 's' }, { id: 'L2', x: 60, y: 300, net: second });
  return doc;
}
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();

test('#689 netByName: the other net a name would join (net names and I/O markers; the base of a bus name; VHDL case-insensitive)', () => {
  const doc = byName('vhdl', 't');
  const nl = netlist(doc);
  const w2 = nl.wireNet.get('W2'), w3 = nl.wireNet.get('W3'), w1 = nl.wireNet.get('W1');
  assert.equal(netByName(doc, nl, 's', w3), w2, "W3 named s would join W2's net");
  assert.equal(netByName(doc, nl, 'S', w3), w2, 'VHDL: S is s');
  assert.equal(netByName(doc, nl, 's(3:0)', w3), w2, 'the base of a bus name');
  assert.equal(netByName(doc, nl, 'a', w3), w1, "an I/O marker's name");
  assert.equal(netByName(doc, nl, 's', w2), null, 'its own name: no other net');
  assert.equal(netByName(doc, nl, 'u', w3), null, 'a new name');
  assert.equal(netByName(doc, nl, '', w3), null);
  const v = byName('verilog', 't');
  const vn = netlist(v);
  assert.equal(netByName(v, vn, 'S', vn.wireNet.get('W3')), null, 'Verilog: S is not s');
  assert.equal(netByName(v, vn, 's', vn.wireNet.get('W3')), vn.wireNet.get('W2'));
});

test('#689 two wires with the same net name: one net (no warnings); different names: two nets', () => {
  const nl = netlist(byName('vhdl'));
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O S2.I', 'S2.O port:P2']);
  assert.equal(nl.wireNet.get('W2'), nl.wireNet.get('W3'));
  assert.equal(nl.wireNet.get('W2').name, 's');
  assert.deepEqual(nl.diagnostics.map(d => d.message), [], 'no warnings');
  const apart = netlist(byName('vhdl', 't'));
  assert.notEqual(apart.wireNet.get('W2'), apart.wireNet.get('W3'));
  assert.deepEqual(apart.diagnostics.map(d => d.message).sort(), ["net 's' connects only U1.O", "net 't' connects only U2.I", "net 't' has no driver (read by U2.I)"]);
  // the gates example connects its nets by name this way (a, b, c, d, prime_sop, prime_nand on two wires each)
  const gates = JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8'));
  const gn = netlist(gates);
  for (const name of ['a', 'b', 'c', 'd', 'prime_sop', 'prime_nand']) {
    const ls = gates.labels.filter(l => l.net === name);
    assert.equal(ls.length, 2, name);
    assert.equal(gn.labelNet.get(ls[0].id), gn.labelNet.get(ls[1].id), `${name}: one net`);
  }
});

const TB = {
  vhdl: `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal a, y : std_logic := '0';
begin
  uut: entity work.byname port map (a => a, y => y);
  process begin
    a <= '0'; wait for 10 ns; assert y = '0' report "a=0" severity error;
    a <= '1'; wait for 10 ns; assert y = '1' report "a=1" severity error;
    report "done"; wait;
  end process;
end t;
`,
  verilog: `\`timescale 1ns/1ps
module tb;
  reg a = 0;
  wire y;
  byname uut (.a(a), .y(y));
  initial begin
    a = 0; #10; if (y !== 0) $error("a=0");
    a = 1; #10; if (y !== 1) $error("a=1");
    $display("done"); $finish;
  end
endmodule
`,
};
test('#689 connected by name: the VHDL and the Verilog have one signal s, compiled and simulated (y = a)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(byName(lang), { lang });
    assert.deepEqual(g.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const decl = lang === 'vhdl' ? /signal s\b[^;]*;/g : /wire s\b[^;]*;/g;
    assert.equal((g.code.match(decl) || []).length, 1, `${lang}: one signal s\n${g.code}`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `byname.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    const log = r.sim.log.map(l => `${l.kind}:${l.text}`);
    assert.deepEqual(r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], `${lang}: ${log.join('\n')}`);
    assert.ok(log.some(l => /done/.test(l)), `${lang}: ran to the end: ${log.join('\n')}`);
  }
});

// #734: a net connected by name renamed as a whole: its net names and its I/O marker of the old name
test('#734 renameNet: every net name of the set takes the new name (VHDL: any case), each its own bus range; still one net, and it simulates', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = byName(lang, lang === 'vhdl' ? 'S' : 's');   // (VHDL: S is s)
    const nl = netlist(doc);
    const r = renameNet(doc, nl, nl.labelNet.get('L1'), 'q', 'L1');
    assert.deepEqual([r.labels.map(l => l.id), r.ports.length], [['L1', 'L2'], 0], lang);
    assert.deepEqual(doc.labels.map(l => l.net), ['q', 'q'], lang);
    const after = netlist(doc);
    assert.equal(after.wireNet.get('W2'), after.wireNet.get('W3'), `${lang}: still one net`);
    assert.deepEqual(after.diagnostics.map(d => d.message), [], `${lang}: no warnings`);
    const g = generateHdl(doc);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const sim = simulate([{ path: `byname.${ext}`, text: g.code }, { path: `tb.${ext}`, text: TB[lang] }], 'tb', { until: 1e6 });
    assert.deepEqual(sim.errors.map(e => e.message), [], `${lang}: compiles\n${g.code}`);
    assert.deepEqual(sim.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure'), [], lang);
  }
  // Verilog: S and s are two names, two nets: S is left alone
  const v = byName('verilog', 'S');
  const vr = renameNet(v, netlist(v), netlist(v).labelNet.get('L1'), 'q', 'L1');
  assert.deepEqual([vr.labels.length, v.labels.map(l => l.net)], [1, ['q', 'S']]);
});

test('#734 renameNet: a bus keeps each label\'s range; another name on the same net and a new name of nothing are left alone', () => {
  const doc = byName('vhdl');
  doc.labels[0].net = 'd(3:0)'; doc.labels[1].net = 'd(3:0)';
  doc.labels.push({ id: 'L3', x: 180, y: 100, net: 'other' });   // a second name on W2's net
  const nl = netlist(doc);
  const r = renameNet(doc, nl, nl.labelNet.get('L2'), 'q', 'L2');
  assert.deepEqual(doc.labels.map(l => l.net), ['q(3:0)', 'q', 'other']);
  assert.deepEqual(r.labels.map(l => l.id), ['L1', 'L2']);
  assert.deepEqual(renameNet(doc, nl, null, 'x'), { labels: [], ports: [] });
  assert.deepEqual(renameNet(doc, nl, nl.labelNet.get('L1'), 'bad name!'), { labels: [], ports: [] });
});

test('#734 renameNet: a net named like an I/O marker renames the marker too (a port of the module)', () => {
  const doc = byName('vhdl', 'a');   // W3's net named a: connected by name to the input marker a
  const nl = netlist(doc);
  assert.equal(nl.labelNet.get('L2'), nl.wireNet.get('W1'), 'one net with the marker');
  const r = renameNet(doc, nl, nl.labelNet.get('L2'), 'b', 'L2');
  assert.deepEqual([r.labels.map(l => l.id), r.ports.map(p => p.id)], [['L2'], ['P1']]);
  assert.deepEqual([doc.ports.map(p => p.name), doc.labels.map(l => l.net)], [['b', 'y'], ['s', 'b']]);
  const after = netlist(doc);
  assert.equal(after.labelNet.get('L2'), after.wireNet.get('W1'), 'still connected to the marker');
  assert.match(generateHdl(doc).code, /\bb\s*:\s*in\b/i);
});
