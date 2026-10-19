// The vga example's test bench passes on its Post-Synthesis Simulation Model (#120), in VHDL and in Verilog, and
// the Board Emulator's compiled engine runs the model as the event-driven simulator does (#561): two frames of
// gate-level simulation in each language, a file of its own so it runs alongside the other examples'
// (test/sim-model.test.js, #575).
import { examplePostSynthTests } from './sim-model-lib.mjs';

examplePostSynthTests(['vga']);
