In short:

- **Convert to Schematic:** a Verilog module whose ports are escaped names (`\opcode[0] `) is converted; its
  schematic's HDL keeps the names escaped.

In detail:

- **Convert to Schematic: escaped identifiers (#1697):** a Verilog escaped name becomes a marker, net or pin named
  with its backslash (`\opcode[0]`); the HDL generated from a schematic writes such a name escaped in Verilog
  (`\opcode[0] `) and as an extended identifier in VHDL (`\opcode[0]\`), so the module's instances connect by name
  as before. A name that is not an identifier, without its backslash, is still refused.
