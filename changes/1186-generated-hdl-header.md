In short:

- The HDL generated from a drawing says in its header that it is generated from the drawing and is edited there, not "kept in sync (edit either one)".

In detail:

- The headers of the HDL generated from a schematic, an ASM chart, a state diagram and a truth table (VHDL and Verilog) say to edit the drawing, not the file, as the Petri net's did: the file is read-only since #1176. The examples' generated HDL (gates, blinky, traffic) differs in that header line only (#1186).
