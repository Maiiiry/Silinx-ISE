In short:

- **Schematic: a net connected by name renamed as a whole:** renaming one of its net names renames the others of
  that name too (and its I/O marker, a port of the module), so the net stays one; one Undo takes it all back.

In detail:

- **Renaming a net connected by name renames the set (#734):** a net name's Name, a wire's Rename net and a net name
  put on an existing one now rename every net name of that net with the old name (case-insensitive in VHDL), each
  keeping its own bus range (d(7:0) becomes q(7:0)), and its I/O marker of that name (core/schdoc.js renameNet); the
  status line says what else took the name. Tests: test/sch-netname.test.js (the set, VHDL's case, a bus range,
  another name on the net left alone, the marker, the HDL compiled and simulated, in VHDL and Verilog),
  test/ui/sch-netname.test.js (the rename, the note, one Undo, the marker; both interfaces, English and Portuguese).
