In detail:

- **mountSchEditor split, fifth part: the tools in web/js/sch-tools.js (#405):** the schematic editor's tools (the
  tool in use and its options, a symbol placed, a wire drawn, a net name attached, an I/O marker added, the points a
  wire connects to) move from mountSchEditor to mountTools(ctx), called at the same point of the mount; no change in
  behaviour. Tests: `test/ui/sch-tools.test.js`, the tools mounted alone on a real document.
