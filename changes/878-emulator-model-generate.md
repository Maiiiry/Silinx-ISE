In short:

- **The Board Emulator's Model menu offers every model:** a netlist model not generated yet (Post-Synthesis,
  Post-Translate, Post-Map, Post-Place & Route) can be chosen; the emulator asks to generate it, as Emulate from the
  Processes list does.

In detail:

- **The emulator's Model menu: a model not generated chosen offers "Generate and Emulate" (#878):** its options are no
  longer disabled (still marked "(not generated)"); choosing one goes through the question of #490 and the emulator
  opens on the model once it is generated; cancelled, the emulator and its menu stay on the model running. The Tasks
  interface's Emulate task (#801), which has no Processes list, had no way to emulate a netlist model.
