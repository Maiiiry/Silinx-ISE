In detail:

- **The Spartan-6 primitives simulated (#720, #1):** Silinx's models of the cells the open synthesis maps a Spartan-6
  design onto (Yosys `xc6s`): CARRY4, SRLC32E, the SLICEM's RAM128X1S / RAM128X1D / RAM256X1S / RAM32M / RAM64M,
  DSP48A1 (its registers, pre-adder, multiplier, X / Z multiplexers, post-adder, synchronous or asynchronous reset)
  and RAMB16BWER / RAMB8BWER (every width, TDP and SDP, byte write enables, the write modes, the output register,
  SRVAL, INIT), in the UNISIM library of the simulator (`core/unisim-s6.js`) and in the Board Emulator's compiled
  engine (`core/compiled-prims-s6.js`). The Post-Synthesis Simulation Model of a design synthesized for the XC6SLX16
  (Nexys3) can be simulated: every example's test bench passes on it in VHDL and in Verilog, with no warnings, and
  the compiled engine runs it as the event-driven simulator does; each primitive's netlists simulate as their RTL.
