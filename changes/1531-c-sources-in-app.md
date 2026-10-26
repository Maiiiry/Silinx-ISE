In short:

- **C sources in a project:** a `.c` file is a module of the project, its HDL generated from its top function (Silinx C,
  compatible with Vitis HLS): its Design row shows the C as the base and its VHDL / Verilog, read-only; it can be the
  top, simulated, seen as an RTL schematic and implemented. New Source ▸ C Function (HLS) makes one.

In detail:

- **C sources in the app, a first part of #1531:** core/view-hdl.js (a C source's HDL made in memory, as a drawing's
  without an HDL file, #177; in the project's language), web/js/project.js and app.js (the `.c` files read and compiled
  with the project, made again on a save), web/js/c-source.js and design.js (the `[C]` and `[VHDL]` / `[Verilog]`
  badges, the generated HDL read-only), web/js/new-source.js (C Function (HLS), its template), web/js/open-flow-browser.js
  and server/ise.js (built in the browser and on the server). Tests: test/ui/c-source.test.js, test/c-hdl.test.js,
  test/view-hdl.test.js, the New Source tests.
