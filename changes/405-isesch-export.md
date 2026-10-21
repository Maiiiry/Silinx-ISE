In detail:

- **core/isesch.js split: the export to ISE in core/isesch-export.js (#405):** writing a Silinx schematic as an ISE 14.7
  schematic (its library symbols, the Silinx-only xl_… symbols with their .sym and HDL files, wires, bus taps, net
  names, I/O markers) moves to a module of its own; isesch.js still exports exportIseSch, decodeXlSymbol and
  iseTimestamp. No change in behaviour. Tests: `test/isesch-export.test.js`.
