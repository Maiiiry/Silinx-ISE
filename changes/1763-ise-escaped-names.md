In short:

- **ISE schematic export of escaped names:** a schematic whose markers, nets or HDL block pins have escaped names
  (`\opcode[0]`, made from an EPFL netlist) is exported with the names ISE can hold (`opcode_0`, the ones it reads
  back), and the export says which in one warning.

In detail:

- **Escaped names in an ISE schematic (#1763):** ISE's names are identifiers (`[A-Za-z_][A-Za-z0-9_]*`, its
  `sch2hdl` refuses any other), which an escaped name cannot be: the export writes it with its other characters as
  `_`, none first nor last (`opcode_0`; it wrote `_opcode_0_`, which the import renamed again and which `sch2hdl`
  wrote as a VHDL port), for I/O markers, nets and the pins of an HDL block's symbol (its module's ports named so
  too), and lists them in one warning ("names written as identifiers …").
