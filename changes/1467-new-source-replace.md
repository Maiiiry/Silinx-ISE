In short:

- **Replacing a source:** New Source on a name that exists asks Replace or Cancel; Cancel goes back to the name, selected to edit it.

In detail:

- **Replacing a source from a wizard (#1467):** the question of New Source (and of the Module, Schematic, Test
  Bench, Petri Net, Clocking and Block Memory wizards) on a file that exists answers Replace / Cancel (Substituir /
  Cancelar) instead of Yes / No; after Cancel, New Source's file name is kept and selected. A drawing replaced
  takes its HDL file, generated from it, with it: made again from the new drawing (it was left in the new drawing's
  way, a warning that its HDL file exists already). A name typed with a drawing's extension (`ctl.fsm.json`,
  `ctl.pn.json`) is written as `src/ctl.fsm.json`, the file the replace question was about (not
  `src/ctl.fsm.json.fsm.json`).
