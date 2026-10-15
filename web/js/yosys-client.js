// The page's side of web/js/yosys-worker.js: run(args, files, onLine) for core/synth-open.js, with
// Yosys in Web Workers (kept: the WebAssembly module is fetched and compiled once in each). The runs the
// open synthesis makes at once (its mappings from the same netlist) go in parallel, up to WORKERS at a
// time, the others queued (#276): 2 when the device has the cores and the memory for them (each Yosys
// takes about 2 GB on a design such as pong), 1 otherwise.
// When Yosys crashes rather than stops on an error of the design (no exit code: an exception inside
// its WebAssembly module, e.g. out of memory), the worker is replaced and the run made once more in
// the new one, whose memory is fresh (#153); from then on one Yosys at a time.
const nav = globalThis.navigator || {};
export const WORKERS = (nav.hardwareConcurrency || 1) >= 4 && (nav.deviceMemory === undefined || nav.deviceMemory >= 8) ? 2 : 1;

let max = WORKERS, seq = 0;
const idle = [], busy = new Set(), queue = [];

function startWorker() {
  const w = new Worker('/js/yosys-worker.js', { type: 'module' });
  w.job = null;
  w.onmessage = ({ data }) => {
    const p = w.job;
    if (!p || data.id !== p.id) return;
    if (data.line !== undefined) { p.onLine(data.line); return; }
    if (data.progress !== undefined) { p.onProgress?.(data.progress); return; }
    w.job = null;
    if (data.error && data.crash && !p.retried) {
      // a fresh worker for this run (and the next ones), one Yosys at a time; the crashed one ended
      p.onLine(`${data.error}: Yosys is started again (a new worker) and the synthesis run once more`);
      max = 1;
      busy.delete(w);
      w.terminate();
      queue.unshift({ ...p, retried: true });
      next();
      return;
    }
    if (data.error) p.reject(Object.assign(new Error(data.error), { code: data.code }));
    else p.resolve(data.files);
    busy.delete(w);
    idle.push(w);
    next();
  };
  w.onerror = e => {
    // the worker could not start (e.g. the module was not found): its run fails, the next ones start afresh
    busy.delete(w);
    w.job?.reject(new Error(`the Yosys worker failed: ${e.message || 'could not be loaded'}`));
    w.job = null;
    next();
  };
  return w;
}

// the queued runs onto the idle workers, or new ones up to max (fewer kept when max went down)
function next() {
  while (queue.length) {
    while (idle.length && busy.size + idle.length > max) idle.pop().terminate();
    const w = idle.pop() || (busy.size < max ? startWorker() : null);
    if (!w) return;
    const p = queue.shift();
    w.job = { ...p, id: ++seq };
    busy.add(w);
    w.postMessage({ id: w.job.id, args: p.args, files: p.files });
  }
}

/** run() for core/synth-open.js. onProgress(0…1) while the WebAssembly module is being fetched. */
export function yosysBrowser(args, files, onLine = () => {}, onProgress) {
  return new Promise((resolve, reject) => { queue.push({ resolve, reject, onLine, onProgress, args, files }); next(); });
}
// (how many at a time, for core/synth-open.js)
Object.defineProperty(yosysBrowser, 'parallel', { get: () => max });
