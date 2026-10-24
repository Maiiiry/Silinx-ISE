In short:

- **The multiplexers as wide as the DEMUX:** M2_1, M4_1 and M8_1 are drawn 70 px wide, their pin names roomier turned
  or mirrored; the schematics saved before are converted when opened, every wire still connected.

In detail:

- **The multiplexers 70 px wide (#1136):** as the DEMUX (M16_1 keeps its 80, room for its 4 select bits); their select
  bits where they were. A schematic of before (document version 3) is converted to version 4 on opening
  (core/schdoc-upgrade.js): each multiplexer placed so that its inputs stay put, its output's connections moved with
  it (a wire's end, an I/O marker, a net name; a run added for a wire leaving it across or another symbol's pin on
  it); the netlist and the HDL unchanged. The clipboard says the document version it was copied from.
- **A bus width on a lead up or down written upright on it (#1139),** the lead broken under it, no longer turned.
