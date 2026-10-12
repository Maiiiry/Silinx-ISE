// The page's side of web/js/yosys-worker.js: run(args, files, onLine) for core/synth-open.js, with
// Yosys in a Web Worker (one worker, kept: the WebAssembly module is fetched and compiled once).
// When Yosys crashes rather than stops on an error of the design (no exit code: an exception inside
// its WebAssembly module, e.g. out of memory), the worker is replaced and the run made once more in
// the new one, whose memory is fresh (#153).
let worker = null, seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  const w = worker = new Worker('/js/yosys-worker.js', { type: 'module' });
  w.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.line !== undefined) p.onLine(data.line);
    else if (data.progress !== undefined) p.onProgress?.(data.progress);
    else {
      pending.delete(data.id);
      if (!data.error) p.resolve(data.files);
      else if (data.crash && !p.retried) {
        // a fresh worker for this run (and the next ones); the others still running finish in this one
        p.onLine(`${data.error}: Yosys is started again (a new worker) and the synthesis run once more`);
        if (worker === w) worker = null;
        if (![...pending.values()].some(q => q.worker === w)) w.terminate();
        send({ ...p, retried: true });
      } else p.reject(Object.assign(new Error(data.error), { code: data.code }));
    }
  };
  w.onerror = e => {
    // the worker could not start (e.g. the module was not found): fail every run, start afresh next time
    for (const [id, p] of pending) if (p.worker === w) { pending.delete(id); p.reject(new Error(`the Yosys worker failed: ${e.message || 'could not be loaded'}`)); }
    if (worker === w) worker = null;
  };
  return w;
}

function send(p) {
  const id = ++seq;
  const w = getWorker();
  pending.set(id, { ...p, worker: w });
  w.postMessage({ id, args: p.args, files: p.files });
}

/** run() for core/synth-open.js. onProgress(0…1) while the WebAssembly module is being fetched. */
export function yosysBrowser(args, files, onLine = () => {}, onProgress) {
  return new Promise((resolve, reject) => send({ resolve, reject, onLine, onProgress, args, files }));
}
