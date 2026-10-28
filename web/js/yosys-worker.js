// Web Worker: runs Yosys compiled to WebAssembly (YoWASP, /vendor/yowasp-yosys) off the page's
// thread, so that the interface keeps working during a synthesis (core/synth-open.js).
//   in:  { id, args, files }                 out: { id, line } … then { id, files } or { id, error, code, crash }
//                                              and { id, progress: 0…1 } while the module is fetched
import { runYosys } from '/vendor/yowasp-yosys/gen/bundle.js';
import { runYosysOnce } from '/core/synth-open.js';

self.onmessage = async ({ data: { id, args, files } }) => {
  const fetchProgress = e => { if (e.totalLength) self.postMessage({ id, progress: e.doneLength / e.totalLength }); };
  try { self.postMessage({ id, files: await runYosysOnce(runYosys, args, files, line => self.postMessage({ id, line }), { fetchProgress }) }); }
  catch (e) { self.postMessage({ id, error: e.message, code: e.code, crash: e.crash }); }
};

# Automated fix for issue #1877: Windows: 'measure designs: every observation design of a part in one folder' cannot find gen-obshdl (#3)
