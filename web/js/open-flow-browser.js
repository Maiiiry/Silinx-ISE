// The Silinx toolchain in the browser edition (the single-file Silinx-ISE.html, on GitHub Pages):
// Implement Design / Generate Programming File without any server or Xilinx tool. The flow is
// core/open-flow-core.js, run in a Web Worker (web/js/open-flow-worker.js); the device descriptions,
// the bit database and Yosys (WebAssembly) are fetched from the site's assets/ folder (published
// with the page: .github/workflows/pages.yml).
import { unconstrainedPorts } from '/core/auto-pins.js';

// the devices whose device description and bit database are published (core/fpga/devices,
// research/s3e-bitstream/db): device/package -> the description's file
export const BROWSER_DEVICES = {
  'xc3s100e/cp132': 'xc3s100ecp132-4.json.gz',
  'xc3s250e/cp132': 'xc3s250ecp132-4.json.gz',
  'xc3s500e/fg320': 'xc3s500efg320-4.json.gz',
  'xc3s1200e/fg320': 'xc3s1200efg320-4.json.gz',
};
const SITE_ASSETS = 'https://pmnmalo.github.io/Silinx-ISE/assets/';

/** Where the assets are: next to the page when it is served (the site), else the site's (a page
 *  opened from a file). */
export function assetsBase(loc = globalThis.location) {
  if (globalThis.SILINX_ASSETS) return globalThis.SILINX_ASSETS;
  return loc && /^https?:$/.test(loc.protocol) ? new URL('assets/', loc.href).href : SITE_ASSETS;
}

/** Can the browser edition implement a design for this device? { available, reason, part }. */
export function browserOpenStatus(device = {}) {
  const dev = String(device.part || '').toLowerCase(), pkg = String(device.package || '').toLowerCase();
  const speed = String(device.speed || '-4').replace(/^(?!-)/, '-');
  const part = `${dev}${pkg}${speed}`;
  const list = Object.keys(BROWSER_DEVICES).map(k => k.replace('/', ' ')).join(', ');
  if (String(device.family || 'spartan3e').toLowerCase() !== 'spartan3e' || !/^xc3s\d+e$/.test(dev)) {
    return { available: false, part, reason: `the Silinx toolchain supports the Spartan-3E only (${list}); other devices need Xilinx ISE, in the full application` };
  }
  if (!BROWSER_DEVICES[`${dev}/${pkg}`]) return { available: false, part, reason: `no device description of the ${dev} in the ${pkg} package yet (only ${list})` };
  return { available: true, part, graph: BROWSER_DEVICES[`${dev}/${pkg}`], reason: `${part}: device description and bit database (in the browser)` };
}

const CHAIN = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'];
const ALIASES = { implement: 'par', impl: 'par', synthesize: 'synth', xst: 'synth', ngdbuild: 'translate', place: 'par', route: 'par', timing: 'trce', bit: 'bitgen' };
/** The steps of a run: the chain from synthesis to the last step asked for (as the server's openSteps). */
export function browserSteps(steps) {
  const set = new Set((Array.isArray(steps) ? steps : [steps]).filter(Boolean).map(s => ALIASES[String(s).toLowerCase()] || String(s).toLowerCase()));
  if (!set.size) CHAIN.forEach(s => set.add(s));
  const bad = [...set].filter(s => !CHAIN.includes(s) && s !== 'fpgaview' && s !== 'pin2ucf');
  if (bad.length) throw new Error(`not available in the Silinx toolchain (they need Xilinx ISE, in the full application): ${bad.join(', ')}`);
  if (set.has('par')) set.add('trce');
  if (set.has('bitgen')) set.add('prombit');
  const last = Math.max(-1, ...[...set].map(s => CHAIN.indexOf(s)));
  const out = CHAIN.slice(0, last + 1);
  // the pins of the placement (Back-annotate Pin Locations): after Place & Route, before the bitstream
  if (set.has('pin2ucf')) { if (!out.includes('par')) out.push(...CHAIN.slice(out.length, CHAIN.indexOf('trce') + 1)); out.splice(out.indexOf('trce') + 1, 0, 'pin2ucf'); }
  if (set.has('fpgaview')) { if (!out.includes('par')) out.push(...CHAIN.slice(out.length, CHAIN.indexOf('trce') + 1)); out.push('fpgaview'); }
  return out;
}

let worker = null;
function getWorker() {
  if (worker) return worker;
  const src = globalThis.SILINX_FLOW_WORKER_SRC;   // the single-file edition: the worker's code, embedded
  worker = src ? new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' }) : new Worker('/js/open-flow-worker.js', { type: 'module' });
  return worker;
}

/**
 * Run the flow for a project. project: { name, top, device, board, files: [{ path, lang, role }],
 * constraints, impl }; files: { path: text } (the project's files, and build/ of an earlier run);
 * steps as the processes ask. onLine(line); onWrite(path, data) for each file of the build.
 * Resolves { ok, report, error, view }.
 */
export async function runBrowserFlow({ project, files, steps, onLine, onWrite = () => {}, onReport = () => {} }) {
  const st = browserOpenStatus(project.device || {});
  if (!st.available) throw new Error(`the Silinx toolchain cannot implement this design: ${st.reason}`);
  const top = project.top;
  if (!top) throw new Error('the project has no top module');
  const sources = (project.files || []).filter(f => ['design', 'impl'].includes(f.role || 'design') && (f.lang === 'verilog' || f.lang === 'vhdl') && typeof files[f.path] === 'string')
    .map(f => ({ path: f.path, lang: f.lang, text: files[f.path] }));
  if (!sources.length) throw new Error('the project has no design HDL files');
  const ucf = project.constraints && typeof files[project.constraints] === 'string' ? files[project.constraints] : null;
  // the port bits without a pin: on a board they would go to arbitrary pins (refused, as the server does)
  const unplaced = await unconstrainedPorts(sources, top, ucf || '');
  if (unplaced.length && project.board) throw new Error(`${unplaced.length} top-level port bit(s) have no pin location (LOC) for the ${project.board} board: ${unplaced.slice(0, 12).map(u => u.net).join(', ')}${unplaced.length > 12 ? ', …' : ''}. Assign them in I/O Pin Planning (or remove the board in Design Properties).`);
  if (unplaced.length) onLine(`WARNING:Silinx - ${unplaced.length} port bit(s) have no LOC constraint (${unplaced.slice(0, 8).map(u => u.net).join(', ')}${unplaced.length > 8 ? ', …' : ''}): the Silinx toolchain chooses their pins - do NOT program real hardware with this bitstream`);
  const dev = String(project.device.part).toLowerCase(), pkg = String(project.device.package).toLowerCase();
  const spec = { top, part: st.part, device: dev, pkg, family: 'spartan3e', graph: st.graph, steps: browserSteps(steps), seed: 1, effort: 1, startupClk: project.impl?.startupClk || 'JtagClk' };
  onLine(`Silinx implementation with the Silinx toolchain, in the browser (no ISE): ${project.name} top=${top} device=${st.part}`);
  const earlier = {};
  for (const [k, v] of Object.entries(files)) if (k.startsWith('build/') && typeof v === 'string') earlier[k.slice(6)] = v;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    w.onmessage = ({ data }) => {
      if (data.line !== undefined) onLine(data.line);
      else if (data.write !== undefined) onWrite(data.write, data.data);
      else if (data.report !== undefined) onReport(data.report);
      else if (data.done) resolve(data.done);
    };
    w.onerror = e => { worker = null; reject(new Error(`the Silinx toolchain could not start in this browser: ${e.message || 'the worker failed'}`)); };
    w.postMessage({ spec, sources, ucf, ucfName: project.constraints ? project.constraints.split('/').pop() : null, files: earlier, assets: assetsBase() });
  });
}
