// The Silinx toolchain's flow, in its own process (started by server/open-flow.js, so that the long
// synchronous parts, placing and routing, never hold the server; Stop kills it):
//   node server/open-flow-run.js build/open/flow.json
// flow.json: { top, part, device, family, pkg, graph, bitDbDir, sources: [{ path, lang, file }], ucf,
//   buildDir, outDir, steps, seed, effort, startupClk }.
// Prints "=== SILINX STEP <step> ===" before each step, "=== SILINX FAILED <step> (exit 1) ===" and
// the ERROR lines when one fails, "=== SILINX DONE ===" at the end (the protocol of ISE's run.sh), and
// writes build/open/report.json after every step (what the Design Summary shows).
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { parseXdl, writeXdl } from '../core/xdl.js';
import { parseUcf } from '../core/ucf.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { replicationPlan, replicateFlipFlops, REPLICATE_MAX_SLICES } from '../core/fpga/replicate.js';
import { deviceSites, place, placedXdl } from '../core/fpga/place.js';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { routeDesign, checkRouting, clockReach, bufgReach } from '../core/fpga/route.js';
import { bitgen, knownRouting } from '../core/fpga/bitgen.js';
import { loadDb } from '../research/s3e-bitstream/db.mjs';
import { analyzeTiming, timingReport, checkPeriods, clockPort, delayTable } from '../core/fpga/timing.js';

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { top, outDir, buildDir } = spec;
const report = { files: {} };
const save = () => fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const rel = f => path.relative(path.dirname(buildDir), f).split(path.sep).join('/');   // build/open/…
const ISE_HINT = 'The Silinx toolchain does not support this yet: implement the design in an ISE mode (Toolchain Settings).';

class StepError extends Error {
  constructor(message, list = [], hint = ISE_HINT) { super(message); this.list = list; this.hint = hint; }
}
let current = null;
const step = name => { current = name; console.log(`=== SILINX STEP ${name} ===`); };
const ms = t => `${((Date.now() - t) / 1000).toFixed(1)} s`;
const pct = (u, t) => (t ? Math.round((100 * u) / t) : 0);
const util = (name, used, total) => ({ name, used, total, percent: pct(used, total) });

// the device and the bit database are loaded once, when first needed
let dev = null, db = null, known = null;
const device = () => (dev ||= loadDeviceCache(spec.graph));
const bitDb = () => (db ||= loadDb(`${spec.device}${spec.pkg}`, { graph: device(), dir: spec.bitDbDir }));
const knownPips = () => (known ||= knownRouting(bitDb()));

const ucfText = spec.ucf ? fs.readFileSync(spec.ucf, 'utf8') : null;
let synth = null, netlist = null, packed = null, routedText = null;

async function runSynth() {
  const t = Date.now();
  const srcs = spec.sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(s.file, 'utf8') }));
  for (const s of srcs) console.log(`${s.lang === 'vhdl' ? 'Parsing VHDL' : 'Analyzing Verilog'} file "${s.path}"`);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = elaborate(lib, top);
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length) throw new StepError('the design has errors', errs.map(e => `${e.file}:${e.line} ${e.message}`), 'Fix them (Check Syntax shows them in the Errors tab).');
  console.log(`Writing <${top}> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the ${spec.family} cells.`);
  let r;
  try {
    r = await synthesizeOpen(design, { family: spec.family, run: yosysNode, onLine: l => { if (/^(Warning|ERROR)/.test(l)) console.log(l.replace(/^Warning:/, 'WARNING:Yosys -').replace(/^ERROR:/, 'ERROR:Yosys -')); } });
  } catch (e) {
    for (const l of e.lines || []) if (/ERROR/.test(l)) console.log(l);
    throw new StepError(`synthesis failed: ${e.message}`);
  }
  for (const w of r.warnings.filter(w => !/^Warning:/.test(w))) console.log(`WARNING:Synthesis - ${w}`);
  for (const [name, text] of Object.entries(r.files)) fs.writeFileSync(path.join(outDir, name), text);
  const u = r.util;
  const items = [['luts', 'Number of 4 input LUTs'], ['flipFlops', 'Number of Slice Flip Flops'], ['latches', 'Number of latches'], ['muxes', 'Number of F5-F8 multiplexers'],
    ['carry', 'Number of carry cells'], ['shiftRegisters', 'Number of shift registers'], ['distributedRam', 'Number of distributed RAMs'], ['blockRam', 'Number of RAMB16s'],
    ['multipliers', 'Number of MULT18X18SIOs'], ['clockBuffers', 'Number of GCLKs'], ['dcms', 'Number of DCMs'], ['ios', 'Number of IOs']]
    .filter(([k]) => u[k]).map(([k, name]) => ({ name, used: u[k], total: null, percent: null }));
  console.log('Device utilization (open synthesis):');
  for (const i of items) console.log(`  ${i.name}: ${i.used}`);
  report.synthesis = { tool: 'Yosys', utilization: items, cells: u.cells, warnings: r.warnings.length, errors: 0,
    summary: { luts: { used: u.luts || 0 }, ffs: { used: u.flipFlops || 0 }, iobs: { used: u.ios || 0 } } };
  // (the netlist's name is the elaborated top's: a VHDL top is lower case, #31)
  report.files.netlist = rel(path.join(outDir, `${r.top}.json`));
  report.files.synthesis = rel(path.join(outDir, `${r.top}_stat.txt`));
  synth = r;
  console.log(`Netlist: ${report.files.netlist} (${u.cells} cells) in ${ms(t)}`);
}

function runTranslate() {
  // the netlist of an earlier run: its name may differ from the project's top in case (VHDL, #31)
  const earlier = () => fs.readdirSync(outDir).find(f => f.toLowerCase() === `${top}.json`.toLowerCase());
  const text = synth ? synth.files[`${synth.top}.json`] : fs.readFileSync(path.join(outDir, earlier() || `${top}.json`), 'utf8');
  netlist = readYosysJson(text);
  let ucf = { assignments: {}, clocks: [] };
  try { if (ucfText) ucf = parseUcf(ucfText); } catch (e) { throw new StepError(`the constraints cannot be read: ${e.message}`, [], 'Fix the constraints (Check Constraints).'); }
  const locs = Object.values(ucf.assignments || {}).filter(a => a.loc).length;
  console.log(`Netlist of <${top}> read; constraints: ${spec.ucf ? `${path.basename(spec.ucf)}, ${locs} pin location(s), ${(ucf.clocks || []).length} PERIOD constraint(s)` : 'none'}.`);
}

function runMap() {
  const t = Date.now();
  try {
    // a carry out read by logic leaves through an XOR stage, not XB / YB (not in the bit database)
    packed = pack(netlist, { ucf: ucfText, part: spec.part, carryOut: 'xor' });
  } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
  for (const w of packed.warnings || []) console.log(`WARNING:Pack - ${w}`);
  const items = mapReport();
  console.log('Design summary (pack):');
  for (const i of items) console.log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
  console.log(`Packed in ${ms(t)}.`);
}

// the Design Summary's map section, from the packed design (again after a register replication)
function mapReport() {
  const s = packed.stats;
  const sites = deviceSites(device());
  const nSlices = sites.slices.size, nPads = sites.pads.size, nBufg = sites.bufgmux.length;
  const items = [util('Number of Slice Flip Flops', s.ffs, 2 * nSlices), util('Number of 4 input LUTs', s.luts, 2 * nSlices),
    util('Number of occupied Slices', s.slices, nSlices), util('Number of bonded IOBs', s.iobs, nPads), util('Number of BUFGMUXs', s.bufgs, nBufg)];
  if (s.slices > nSlices) throw new StepError(`the design needs ${s.slices} slices, the device has ${nSlices}`, [], 'Choose a larger device.');
  report.map = { utilization: items, summary: { slices: items[2], ffs: items[0], luts: items[1], iobs: items[3], bufg: items[4] }, carry: s.carry, muxes: s.muxes, warnings: (packed.warnings || []).length, errors: 0 };
  return items;
}

function runPar() {
  const d = device();
  const k = knownPips();
  const delays = delayTable(d, { allowPip: k.allowPip });
  const placeRoute = pk => {
    const t0 = Date.now();
    // each clock's flip-flops on the slices its global line reaches through switches of known bits
    const r = place(pk, deviceSites(d, k), { seed: spec.seed || 1, effort: spec.effort || 1, delays, clockSites: site => clockReach(d, site, k.allowPip), bufgSites: (site, pin, to) => bufgReach(d, site, pin, k.allowPip, to) });
    const placedText = writeXdl(placedXdl(pk, r));
    const tp = ms(t0), t1 = Date.now();
    const routed = routeDesign(parseXdl(placedText), d, { ...k, timing: true });
    const ok = !routed.errors.length && !routed.failed.length;
    return { packed: pk, placement: r, placedText, routed, placeTime: tp, routeTime: ms(t1), sta: ok ? analyzeTiming(parseXdl(writeXdl(routed.design)), d) : null };
  };
  let pr;
  try { pr = placeRoute(packed); } catch (e) { throw new StepError(`placement failed: ${e.message}`); }
  for (const w of pr.placement.warnings || []) console.log(`WARNING:Place - ${w}`);
  // register replication (#4): the flip-flops of many loads on the critical path copied (each copy
  // near a group of the loads, core/fpga/replicate.js), the design placed and routed again; the
  // faster of the two kept
  if (pr.sta && spec.replicate !== false && packed.stats.slices <= REPLICATE_MAX_SLICES) {
    const plan = replicationPlan(netlist, packed, pr.placement, pr.sta);
    if (plan.length) {
      const copies = plan.reduce((a, p) => a + p.groups.length - 1, 0);
      let pr2 = null;
      try { pr2 = placeRoute(pack(replicateFlipFlops(netlist, plan), { ucf: ucfText, part: spec.part, carryOut: 'xor' })); } catch { pr2 = null; }
      const better = pr2?.sta && pr2.sta.period < pr.sta.period;
      console.log(`Register replication: ${plan.length} flip-flop(s) on the critical path copied (${copies} copies): ${better ? `kept, ${pr2.sta.period.toFixed(3)} ns instead of ${pr.sta.period.toFixed(3)} ns` : 'not kept, no faster'}.`);
      if (better) {
        pr = pr2;
        packed = pr.packed;
        const items = mapReport();
        console.log(`Design summary (pack, after the replication): ${items[0].name} ${items[0].used}, ${items[2].name} ${items[2].used}.`);
      }
    }
  }
  const { placement: r, placedText, routed } = pr;
  fs.writeFileSync(path.join(outDir, 'placed.xdl'), placedText);
  report.files.placed = rel(path.join(outDir, 'placed.xdl'));
  console.log(`Placed ${r.sites.length} sites in ${pr.placeTime} (estimated critical path ${r.delay.toFixed(1)} ns): ${report.files.placed}`);
  report.par = { routed: false, unroutedSignals: routed.failed.length, nets: routed.routed, pips: routed.pips, iterations: routed.iterations };
  if (routed.errors.length) throw new StepError('routing errors', routed.errors.slice(0, 50));
  if (routed.failed.length) {
    throw new StepError(`${routed.failed.length} net(s) cannot be routed on the routing switches whose bits are known (the bit database does not know every switch of the device yet)`,
      routed.unreached.slice(0, 50).map(u => `${u.net} -> ${u.inst}.${u.pin}`));
  }
  routedText = writeXdl(routed.design);
  fs.writeFileSync(path.join(outDir, 'routed.xdl'), routedText);
  report.files.routed = rel(path.join(outDir, 'routed.xdl'));
  const check = checkRouting(parseXdl(routedText), d);
  if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
  report.par = { ...report.par, routed: true, unroutedSignals: 0, done: true };
  console.log(`Routed ${routed.routed} nets (${routed.pips} PIPs, ${routed.iterations} passes) in ${pr.routeTime}: ${report.files.routed}`);
  console.log('All signals are completely routed.');
}

function runTiming() {
  const design = parseXdl(routedText);
  const sta = analyzeTiming(design, device());
  const constraints = ucfText ? parseUcf(ucfText).clocks || [] : [];
  const checks = checkPeriods(sta, design, constraints);
  const lines = timingReport(sta, checks);
  fs.writeFileSync(path.join(outDir, 'timing.txt'), `Static timing analysis of ${top} (Silinx toolchain, delay model of core/fpga/timing.js)\n\n${lines.join('\n')}\n`);
  report.files.timing = rel(path.join(outDir, 'timing.txt'));
  const failed = checks.filter(c => !c.missing && !c.met);
  for (const l of lines) if (/^(clock|constraint)/.test(l)) console.log(l);
  for (const c of failed) console.log(`WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port} not met: the clock needs ${c.period.toFixed(3)} ns`);
  for (const c of checks.filter(c => c.missing)) console.log(`WARNING:Timing - constraint PERIOD ${c.required} ns on ${c.port}: no clock of the design comes from this port`);
  const worst = sta.clocks.reduce((a, c) => Math.max(a, c.period), 0);
  report.timing = {
    met: failed.length === 0, timingErrors: failed.length, score: null,
    minPeriodNs: worst ? +worst.toFixed(3) : null, maxFreqMHz: worst ? +(1000 / worst).toFixed(3) : null,
    clocks: sta.clocks.map(c => ({ clock: c.clock, port: clockPort(design, c.clock), minPeriodNs: +c.period.toFixed(3), maxFreqMHz: +(1000 / c.period).toFixed(3) })),
    constraints: checks.filter(c => !c.missing).map(c => ({ name: `PERIOD ${c.port}`, constraint: `PERIOD ${c.required} ns on ${c.port}`, required: c.required,
      minPeriodNs: +c.period.toFixed(3), maxFreqMHz: +(1000 / c.period).toFixed(3), timingErrors: c.met ? 0 : 1, slackNs: +c.slack.toFixed(3) })),
  };
  report.par.constraintsMet = report.timing.met;
  console.log(failed.length ? `${failed.length} constraint(s) not met.` : constraints.length ? 'All constraints were met.' : 'No timing constraints (PERIOD) in the UCF.');
}

function writeBitfile(file, startupClk) {
  const sc = /^cclk$/i.test(startupClk) ? 'Cclk' : /^userclk$/i.test(startupClk) ? 'UserClk' : 'JtagClk';
  const { bytes, unknown } = bitgen(routedText, bitDb(), { name: `${top}.ncd`, crc: true, startupClk: sc, part: `${spec.device.replace(/^xc/, '')}${spec.pkg}` });
  if (unknown.length) {
    throw new StepError(`${unknown.length} feature(s) of the design are not in the bit database: no bitstream`, unknown.slice(0, 50).map(u => `${u.tile} ${u.feature}`));
  }
  fs.writeFileSync(file, bytes);
  return bytes.length;
}

async function main() {
  const steps = spec.steps;
  try {
    if (steps.includes('synth')) { step('synth'); await runSynth(); save(); }
    if (steps.includes('translate')) { step('translate'); runTranslate(); save(); }
    if (steps.includes('map')) { step('map'); runMap(); save(); }
    if (steps.includes('par')) { step('par'); runPar(); save(); }
    if (steps.includes('trce')) { step('trce'); runTiming(); save(); }
    if (steps.includes('bitgen')) {
      step('bitgen');
      const f = path.join(buildDir, `${top}.bit`);
      const n = writeBitfile(f, spec.startupClk);
      report.bit = { path: f, size: n };
      save();
      console.log(`Bitstream: build/${top}.bit (${n} bytes, every feature in the bit database)`);
    }
    if (steps.includes('prombit')) {
      step('prombit');
      const f = path.join(buildDir, `${top}_prom.bit`);
      const n = writeBitfile(f, 'Cclk');
      report.prom = { path: f, size: n };
      save();
      console.log(`PROM bitstream (StartUpClk Cclk): build/${top}_prom.bit`);
    }
    if (steps.includes('fpgaview')) {
      step('fpgaview');
      if (!fs.existsSync(path.join(outDir, 'routed.xdl'))) throw new StepError('no routed design: run Place & Route first', [], '');
      console.log(`The FPGA view reads ${rel(path.join(outDir, 'routed.xdl'))}.`);
    }
    console.log('=== SILINX DONE ===');
  } catch (e) {
    save();
    const msg = e instanceof StepError ? e.message : `${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
    console.log(`ERROR:Silinx - ${msg}`);
    for (const x of e.list || []) console.log(`  ${x}`);
    if (e.hint !== '') console.log(e.hint || ISE_HINT);
    console.log(`=== SILINX FAILED ${current || 'synth'} (exit 1) ===`);
    process.exitCode = 1;
  }
}
await main();
