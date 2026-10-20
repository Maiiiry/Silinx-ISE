In short:

- **Schematic: the width of an adder, subtractor or comparator on its symbol:** an 8-bit adder reads ADD8
  under it, a 4-bit comparator COMP4, as the Xilinx symbols are named, and the width of each bus pin is
  shown beside it; they change as soon as Width does.

In detail:

- **The width on the arithmetic symbols (#681):** ADD, SUB and COMP with bus pins draw their type with their
  width under the symbol (ADD8, SUB16, COMP4, as the gates their type) and the width by each bus pin (A, B,
  S / D), as multiplexers and module symbols do; a CONSTANT wider than a bit shows its width by its output.
  The name comes from one function, `symbolTypeName` in core/schdoc.js (the counters' and registers' CNT8 /
  REG8 too), so the canvas, the printed / saved SVG and the Symbol Info drawing show the same.
