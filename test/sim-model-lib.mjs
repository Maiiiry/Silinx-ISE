// The Post-Translate and Post-Map Simulation Models' tests (#121): a model simulated with a test bench, and
// every example's test bench on both models of the example. The examples' tests are in two files of their
// own (test/sim-model-examples.test.js, test/sim-model-vga.test.js): the tests of one file run one after
// another, and the examples' gate-level simulations are most of the models' tests' time (#566).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { yosysNode } from '../core/synth-open-node.js';
import { runOpenFlow } from '../core/open-flow-core.js';
import { orderOpenSteps } from '../core/open-steps.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { loadDevice } from '../core/fpga/device.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';
import { example } from './examples-lib.mjs';

// the device description Map's report needs (loaded once)
let DEVICE = null;
export const device = () => (DEVICE ||= loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath('xc3s250ecp132-4'))).toString('utf8'))));

// a model compiled with the test bench (its entity replaces the RTL one), elaborated, simulated
export function simulate(sources, file, text, top, until, { stop = /Simulation finished OK|ERROR/ } = {}) {
  const lang = file.endsWith('.v') ? 'verilog' : 'vhdl';
  const all = [...sources, { path: file, lang, text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
  const lib = compile([...primitiveSources(all), ...all]);
  lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const d = elaborate(lib, top);
  const diags = [...lib.errors, ...d.diags].filter(x => x.file === file || x.severity === 'error');
  if (diags.length) return { diags: diags.map(x => `${x.severity} ${x.file}:${x.line} ${x.message}`), log: [] };
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  const step = until / 100;
  for (let t = step; t <= until; t += step) { const st = s.run(t); if (st.finished || s.log.some(e => stop.test(e.text))) break; }
  return { diags: [], log: s.log.map(e => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`) };
}

// an example's flow with both steps (its generics the test bench's): the synthesis and Translate once for
// both models
const flows = new Map();
function exampleFlow(name) {
  if (!flows.has(name)) flows.set(name, (async () => {
    const ex = example(name);
    const design = ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), sim = ex.sim.map(f => ({ path: f.path, lang: f.lang, text: f.text }));
    const written = {}, lines = [];
    const r = await runOpenFlow({ top: ex.project.top, part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['posttrans', 'postmap']), simTop: ex.project.simTop },
      { log: l => lines.push(l), sources: () => design, simSources: () => sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {}, device });
    return { ex, design, sim, r, lines, written };
  })());
  return flows.get(name);
}

// every example's test bench, on both models of the example, VHDL and Verilog, with no warnings (the
// examples' test benches report "Simulation finished OK" when every check passed)
export function exampleModelTests(names) {
  for (const name of names) {
    for (const dir of ['translate', 'map']) {
      test(`example ${name}: its test bench passes on the ${dir === 'map' ? 'post-map' : 'post-translate'} model, VHDL and Verilog (#121)`, { timeout: 900000 }, async () => {
        const { ex, design, sim, r, lines, written } = await exampleFlow(name);
        assert.equal(r.ok, true, lines.join('\n'));
        assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR)/.test(l)), [], name);
        // (the model's files: the synthesis writes the netlist's too; the board's beside them when the test bench
        // gives generics, #622)
        const t = ex.project.top, board = Object.keys(r.report.simModels[dir === 'map' ? 'postmap' : 'posttrans'].generics || {}).length > 0;
        assert.deepEqual(Object.keys(written).filter(f => f.startsWith(`netgen/${dir}/`)).sort(),
          [`netgen/${dir}/${t}_${dir}.v`, `netgen/${dir}/${t}_${dir}.vhd`, ...(board ? [`netgen/${dir}/${t}_${dir}_board.v`, `netgen/${dir}/${t}_${dir}_board.vhd`] : [])]);
        for (const file of [`netgen/${dir}/${t}_${dir}.v`, `netgen/${dir}/${t}_${dir}.vhd`]) {
          const s = simulate([...design, ...sim], file, written[file], ex.project.simTop, name === 'vga' ? 3e10 : 1e11);
          assert.deepEqual(s.diags, [], `${name} ${file}`);
          assert.ok(s.log.some(l => /Simulation finished OK/.test(l)), `${name} ${file}: ${s.log.slice(-4).join(' | ')}`);
          assert.deepEqual(s.log.filter(l => /ERROR|WARNING/.test(l)), [], `${name} ${file}`);
        }
      });
    }
  }
}
