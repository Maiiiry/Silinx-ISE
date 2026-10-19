// Every example's test bench passes on the Post-Translate and Post-Map Simulation Models of the example
// (#121), in VHDL and in Verilog, with no warnings; the vga example in a file of its own,
// test/sim-model-vga.test.js, its two frames of gate-level simulation the longest (#566).
import { EXAMPLES } from './examples-lib.mjs';
import { exampleModelTests } from './sim-model-lib.mjs';

exampleModelTests(EXAMPLES.filter(name => name !== 'vga'));
