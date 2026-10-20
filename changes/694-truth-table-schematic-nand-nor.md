In short:

- **Truth tables:** the schematic of a table is always drawn from it, in its HDL logic, and opens from the
  *Schematic* badge of its row in the Design pane; two new HDL logic forms, *NAND gates only* and *NOR gates
  only*, and the editor shows the NAND and NOR forms of each output. *Generate Schematic* and *Check my
  answer* are gone.

In detail:

- **The schematic of a truth table, always generated, in its HDL logic form (#694):** the table's module row
  in the Design pane has a *Schematic* badge (between *Table* and *VHDL* / *Verilog*) that opens it,
  read-only, redrawn whenever the table or its form changes; not a file of the project. HDL and schematic
  are made from the same expression of each output (`outputForm`): minimal SOP (AND / OR / NOT gates), POS,
  the XOR form (XOR / XNOR gates), NAND or NOR gates only; at most 5 inputs an AND / OR gate, 4 the
  others. The *Generate Schematic* button and its *NAND gates only* check box are removed; a schematic an
  older project made with them stays a module of its own.
- **NAND gates only and NOR gates only (#694):** two new *HDL logic* forms, the minimal SOP with NAND gates
  only and the minimal POS with NOR gates only, by double negation (`gateForm`; a complemented input is an
  inverter, a NAND / NOR of one input): the HDL with NAND (NOR) operations only (`a nand b`,
  `not (a and b and c)`, `a nand a`; `~(a & b)`), the schematic with NAND (NOR) gates only. The editor's
  results show the *NAND form* and the *NOR form* of each output, below the XOR form, with their gate
  counts.
- **No Check my answer (#694):** the editor's *Check my answer* and *My expression* are removed
  (`compareExpr` too).
