In short:

- **Truth tables:** the language of a table's HDL module, VHDL or Verilog, is chosen in the editor (*Language*,
  next to *HDL logic*) and can be changed at any time.

In detail:

- **A truth table's HDL language in its editor (#696):** *Language* (VHDL / Verilog) beside *HDL logic*, as the
  ASM, state diagram and Petri net editors have it: a change makes the table's HDL file again in that language
  and removes the other one (`drawnHdlLanguage`), the Design pane's badge follows (`[VHDL]` / `[Verilog]`,
  last), a module that instances it and the table's schematic keep working. A new table is in the project's
  preferred language, as before.
