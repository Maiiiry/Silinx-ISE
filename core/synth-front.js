// Silinx - the HDL front end's part of the open synthesis (#1674, the toolchain's separation, #1651): an elaborated
// design (core/elaborate.js) as the toolchain's synthesis input, one flat SystemVerilog module (core/synth-verilog.js)
// with its hints, which core/synth-open.js synthesizeVerilog synthesizes with Yosys.
//
//   synthesisInput(design) = { text, top, warnings, shiftArrays, gates }
//   const r = await synthesizeOpen(design, { family: 'spartan3e', run, onLine })   (r: synthesizeVerilog's)
import { toVerilog } from './synth-verilog.js';
import { gateAssignments } from './carry-chain.js';
import { synthesizeVerilog } from './synth-open.js';

// the flat Verilog (text, its top module), the front end's warnings, the arrays of registers written as shift
// registers (Yosys's warning on them expected), and the gates of the design's single-bit assignments (a design written
// as gates gets its carry chains recovered, core/carry-chain.js, #77)
export function synthesisInput(design) {
  const { text, top, warnings, shiftArrays = [] } = toVerilog(design);
  return { text, top, warnings, shiftArrays, gates: gateAssignments(design) };
}

// Synthesize an elaborated design: its synthesis input, synthesized by synthesizeVerilog (its options and its result)
export async function synthesizeOpen(design, options = {}) {
  return synthesizeVerilog(synthesisInput(design), options);
}
