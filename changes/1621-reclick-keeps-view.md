In short:

- **A view clicked again stays open:** a C module's generated HDL, clicked again in the Design pane, stays in
  front instead of closing; so does View C Model run again, and the power report generated again.

In detail:

- **A document made again on opening closed itself on a second open (#1621):** a C module's HDL, its ASM chart, a
  module's C model and the power report close the old document before opening the new one, without waiting for the
  close; the new one found the old still there and the close then removed it. The close is awaited; a UI test clicks
  every row kind's badges twice and double-clicks them (drawings, truth table schematic, VHDL, Verilog, C).
