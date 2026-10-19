// The vga example's test bench passes on its Post-Translate and Post-Map Simulation Models (#121), in VHDL
// and in Verilog, with no warnings: two frames of gate-level simulation each, a file of its own so it runs
// alongside the other examples' (test/sim-model-examples.test.js, #566).
import { exampleModelTests } from './sim-model-lib.mjs';

exampleModelTests(['vga']);
