In short:

- **I/O markers anywhere on the sheet:** the schematic editor's Add I/O Marker tool now places a marker on
  empty space too, named in1, out1, io1… (renamed in place), and a wire drawn later to its tip connects it.

In detail:

- **I/O markers placed on empty space (#680):** Add I/O Marker no longer needs a wire end or a pin. On empty
  space it places a marker of 1 bit (an input unless the options choose another direction) and asks for its
  name with the next free one, in1, out1 or io1 (core/schdoc.js `freePortName`: not taken by a marker, a net
  name or an instance). Its port is in the generated VHDL and Verilog. A wire drawn later from or to its tip,
  or the marker dragged onto a pin or a wire end, connects it. Left unconnected, the editor's Check warns
  `I/O marker 'in1' is not connected`, and Check Syntax gives XST's warnings: `Input <in1> is never used.`,
  `Signal <out1>, unconnected in block <top>, is tied to its initial value.` (a bidirectional one: XST's warning
  to come, #684). The tool's hint and the name prompts are in Portuguese.
