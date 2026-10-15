// Yosys in worker threads for Node (core/synth-open-node.js yosysWorkers, #86): runs given at once go in
// parallel up to n, the others queued; outputs, lines and errors as yosysNode's; the open synthesis
// gives the same netlist; idle workers do not keep the process alive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { yosysNode, yosysWorkers } from '../core/synth-open-node.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { compile, elaborate } from '../core/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// a run of a second or so that prints as it goes (a 16-bit multiplier made of gates)
const MUL = { 'm.v': 'module m(input [15:0] a, b, output [31:0] p); assign p = a * b; endmodule\n' };
const ARGS = ['-p', 'read_verilog m.v; synth -top m; abc -g AND; stat; write_json m.json'];

// each run: when its first line came and when it ended (an event counter, not the clock)
async function timeline(run, k) {
  let tick = 0;
  const runs = Array.from({ length: k }, () => ({ first: null, end: null }));
  const outs = await Promise.all(runs.map(r => run(ARGS, MUL, () => { if (r.first === null) r.first = ++tick; }).then(o => { r.end = ++tick; return o; })));
  return { runs, outs };
}

test('yosysWorkers: two runs at once in parallel, a third queued; the outputs as yosysNode\'s', { timeout: 300000 }, async () => {
  const one = await yosysNode(ARGS, MUL);
  const { runs, outs } = await timeline(yosysWorkers(2), 3);
  // the second starts printing before the first ends; the third only after one of them ended
  assert.ok(runs[1].first < runs[0].end, JSON.stringify(runs));
  assert.ok(runs[2].first > Math.min(runs[0].end, runs[1].end), JSON.stringify(runs));
  for (const o of outs) assert.equal(o['m.json'], one['m.json']);
  // one worker: one after the other
  const serial = await timeline(yosysWorkers(1), 2);
  assert.ok(serial.runs[1].first > serial.runs[0].end, JSON.stringify(serial.runs));
});

test('yosysWorkers: an error of Yosys as yosysNode\'s (its exit code), the worker kept for the next run', { timeout: 300000 }, async () => {
  const run = yosysWorkers(1);
  const bad = ['-p', 'read_verilog nothing.v'];
  const e1 = await yosysNode(bad, {}).catch(e => e);
  const e2 = await run(bad, {}).catch(e => e);
  assert.ok(e1 instanceof Error && e2 instanceof Error);
  assert.deepEqual([e2.message, e2.code], [e1.message, e1.code]);
  assert.equal(e2.code, 1);
  const out = await run(ARGS, MUL);
  assert.match(out['m.json'], /"m"/);
});

test('yosysWorkers: the open synthesis gives the same netlist as with yosysNode, its mappings in parallel', { timeout: 300000 }, async () => {
  const text = `module c(input clk, input [7:0] a, b, output reg [7:0] q); always @(posedge clk) q <= (a << b[2:0]) + (a > b ? a : b); endmodule`;
  const d = elaborate(compile([{ path: 'c.v', lang: 'verilog', text }]), 'c');
  const r1 = await synthesizeOpen(d, { run: yosysNode });
  const r2 = await synthesizeOpen(d, { run: yosysWorkers() });
  assert.equal(r2.files['c.json'], r1.files['c.json']);
  assert.deepEqual(r2.depth, r1.depth);
  assert.deepEqual(r2.warnings, r1.warnings);
});

test('yosysWorkers: idle workers do not keep the process alive', { timeout: 120000 }, () => {
  const script = `import { yosysWorkers } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'core/synth-open-node.js')).href)};
const run = yosysWorkers(2);
const o = await run(['-p', 'read_verilog m.v; write_json m.json'], { 'm.v': 'module m(input a, output y); assign y = a; endmodule' });
console.log(Object.keys(o).includes('m.json') ? 'done' : 'no netlist');`;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yw-')), 'idle.mjs');
  fs.writeFileSync(file, script);
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 100000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'done');
});
