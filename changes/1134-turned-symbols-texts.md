In short:

- **Schematic symbols turned or mirrored:** the pin names of ADD, SUB, COMP, the multiplexers, modules and HDL blocks
  stay inside the body turned 90° or 270°; names crowded on a top or bottom side are written upwards, as ISE does; the
  device primitives' clock inputs have their triangle; a bus pin's width is drawn by its lead, inside the symbol.

In detail:

- **Pin names turned (#1134):** placed past each pin's lead (its symbol's own side, not the turned one: the
  multiplexer's output and COMP's / SUB's result stay unnamed turned 180° or mirrored), a multiplexer's select past its
  slanted edge; the names on a top or bottom side turned to read upwards when one is longer than two letters.
- **The device primitives' clock triangle (#1135):** RAMB16, MULT18X18SIO, DCM_SP, DSP48A1, … draw one at their clock
  pins, as the flip-flops and modules.
- **Bus widths inside the symbol (#1139):** by the lead, 10 px in from the pin's end (above a lead across, beside a
  lead up or down, turned), not beyond the pin where the wire connects.
- **Every symbol in its 8 orientations checked (#1137):** test/web-sch-svg.test.js draws each type turned and mirrored
  and checks its pin names inside the body and off the leads, the hidden names hidden, the clock triangles, the
  widths inside the box.
