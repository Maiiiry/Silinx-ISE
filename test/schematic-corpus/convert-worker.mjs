// The schematic corpus's conversion of a design to a schematic (#1687, items.mjs), in a process of its own: a design
// whose drawing takes too long or too much memory (a gate-level netlist of thousands of gates laid out by ELK) is
// stopped without stopping the run.
//   node convert-worker.mjs <in.json: { sources, top }> <out.json: { doc, hdlPath, writes, newFiles, warnings, counts } | { error }>
import fs from 'node:fs';
import { convertModuleToSchematic } from '../../core/hdl-to-sch.js';

const [input, output] = process.argv.slice(2);
const { sources, top } = JSON.parse(fs.readFileSync(input, 'utf8'));
const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
let out;
try {
  const r = await convertModuleToSchematic({ sources, module: top, layout: g => elk.layout(g) });
  out = { doc: r.doc, hdlPath: r.hdlPath, writes: r.writes, newFiles: r.newFiles, warnings: r.warnings, counts: r.counts };
} catch (e) { out = { error: e.message }; }
fs.writeFileSync(output, JSON.stringify(out));
