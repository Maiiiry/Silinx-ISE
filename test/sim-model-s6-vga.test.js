// The vga example's test bench passes on its Post-Synthesis Simulation Model synthesized for the Spartan-6 (#720),
// in VHDL and in Verilog, with no warnings: a file of its own, its frames of gate-level simulation the longest (#566).
import { examplePostSynthTests } from './sim-model-lib.mjs';

examplePostSynthTests(['vga'], { part: 'xc6slx16csg324-3', family: 'spartan6' });
