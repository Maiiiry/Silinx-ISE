In short:

- **Board Emulator, Spartan-6 clocks:** a design with a PLL_BASE (the Clocking Wizard's Spartan-6 module) or a
  BUFIO2 now runs at the emulator's full speed instead of falling back to the slower simulator.

In detail:

- **PLL_BASE and BUFIO2 in the compiled cycle simulator (#845):** the PLL scheduled as the DCM is (a black box whose
  outputs follow a schedule of their edges in the main clock's cycles: CLKFBOUT, CLKOUT0-5 with their DIVIDE,
  DIVCLK_DIVIDE, duty cycles and phases, LOCKED, RST driven by the design, cascaded with a DCM); BUFIO2 a wire or a
  divider (DIVIDE, DIVIDE_BYPASS, I_INVERT, SERDESSTROBE). A DCM on a clock whose duty cycle is not 50 % is not
  compiled. The event-driven BUFIO2 with I_INVERT no longer sees a rising edge at time 0 (its inverted input is
  high from the start, as on the FPGA). Both engines compared cycle by cycle, in VHDL and Verilog, with the
  Clocking Wizard's PLL module among the designs.
