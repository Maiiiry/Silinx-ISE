In short:

- **Flip-flops in hand-drawn schematics:** a box with its pins written inside it (D, T or J and K, the clock as C,
  CLK or a wedge, CE, CLR, PRE; Q and Q̄) is read as one of Silinx's flip-flops; counters and state machines whose
  wires loop back are read too.

In detail:

- **Hand-drawn flip-flops (#1083, a follow-up of #1067):** `core/ink/flipflops.js` finds the boxes (a closed square
  stroke, or square lines meeting at their ends, with labels inside: an empty box is not one), reads the labels on
  their left (the inputs, a wedge for the clock) and on their right (Q, Q with a bar or a prime), and chooses the
  library's symbol (fd, ft, fjk and their variants by the controls drawn, `ffVariant`). `core/ink/schematic.js` takes
  the flip-flops apart from the gates, ties each wire on a box's left side to the label beside it, a wire on its right
  to Q or Q̄, reads a wire that loops back (its ends close, all of it square), and joins the wires leaving one output
  into one net; its errors: a label that is not a pin, no clock, no data input, a pin without its wire or with two,
  no wire from the outputs, controls the library has no flip-flop for. `core/ink/schematic-doc.js` makes a Q̄ an
  inverter after the Q. The dialog lists a flip-flop with its pins. Held-out circuits (a toggle, a register with an
  enable and a clear, a 2-bit counter, a JK; `core/ink/synth-flipflop.js`) are read, made into a schematic with a
  clean netlist, and their HDL, compiled and clocked (`compileDesign`), gives every cycle the outputs computed from the
  drawing's description (`test/ink-flipflops.test.js`).
- **A small k is read as a k:** it was taken for a letter whose capital is the same shape, larger, so `clk` was read
  as `clK` (#1083).
