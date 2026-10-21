In detail:

- **core/isesch.js split: importIseSch in three phases (#405):** the import of an ISE schematic reads its netlist
  (core/isesch-nets.js), lays out its blocks and maps its coordinates (core/isesch-geometry.js), places and wires them,
  then assembles and checks the document (core/isesch-assemble.js); importIseSch keeps the placement and calls the
  phases (731 → 277 lines). No change in behaviour. Tests: `test/isesch-import.test.js`.
