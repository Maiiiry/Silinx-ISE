In short:

- **Check Syntax warns of an unconnected inout port:** a bidirectional port neither read nor driven (in a
  schematic, a bidirectional I/O marker left unconnected) gets XST's warning, `Inout <io> is never assigned.`,
  with its explanation and fix in English and Portuguese, as an unused input and an unassigned output already do.

In detail:

- **An inout port neither read nor driven, as XST (#684):** the design checks (`core/lint.js`, check
  `unused-inout`) report a bidirectional port that nothing in its module (or below it) reads or drives, at the
  port's line, as `WARNING:Silinx:2565 - Inout <io> is never assigned.`: XST's warning (Xst:2565, learnt from XST
  14.7 on probe designs), one per bit of a bus from its right index (`Inout <iob<0>> is never assigned.`). A port
  only read, only driven (a tri-state buffer) or connected to an instance that uses it gets none, as in XST. Its
  help text is in `core/hints.js`. Silinx's open synthesis gives none of these unused-port warnings (Check Syntax
  does), so it is not added there. Tests: `test/lint.test.js` (VHDL and Verilog, a scalar and a bus, read, driven,
  through an instance, the suppression comment), `test/sch-iomarker-void.test.js` (a schematic's bidirectional
  marker left unconnected), `test/hints.test.js` (the help, English and Portuguese), `test/ui/hints.test.js` (Check
  Syntax and the help in the app, VHDL and Verilog, English and Portuguese).
