In short:

- **Edit Stimuli: one bit of a bus at a time:** in ISim, with a bus expanded, a click on the wave of one of its bits
  changes that bit as a 1-bit signal's (0 → 1 → Z → X on an input, - → 0 → 1 for an expected output); the bus's value
  follows from its bits.

In detail:

- **ISim's drawn stimuli: a bus's bits edited one by one (#919):** a click on a cycle of a bit of an expanded bus paints
  that bit from the cycle up to its next change, the other bits kept; an output's bit holds its own expected value,
  checked alone (its mismatch red on its row and the bus's), and the grid and the expected values are drawn on the bit
  rows. Nothing new is saved: the stimuli keep a bus's bits per cycle, so Save as Test Bench (VHDL and Verilog) drives
  the bus as its bits were edited, and the bus's value dialog sets it whole again (its note says the bus can be
  expanded to change a bit).
