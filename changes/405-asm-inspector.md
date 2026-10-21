In detail:

- **mountAsmEditor split, first part: the inspector in web/js/asm-inspector.js (#405):** the ASM chart editor's
  inspector (the selection's properties and the machine's: its name, clock and reset, initial state, inputs, outputs,
  registers and generics) moves from mountAsmEditor to mountInspector(ctx), called at the same point of the mount; no
  change in behaviour. Tests: `test/ui/asm-inspector.test.js`, the inspector mounted alone.
