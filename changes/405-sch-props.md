In detail:

- **mountSchEditor split, first part: the Properties panel in web/js/sch-props.js (#405):** the schematic editor's
  Properties panel (the sheet's, a symbol's, an I/O marker's, a net name's and a wire's properties, several objects'
  commands, a net connected or renamed by name) moves from mountSchEditor to mountProps(ctx), called at the same point
  of the mount; no change in behaviour. Tests: `test/ui/sch-props.test.js`, the panel mounted alone.
