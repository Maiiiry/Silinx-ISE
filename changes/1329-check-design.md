In short:

- **Tasks ▸ Design: Check Design** next to Close Project, under the Design tree: it checks the syntax of the whole
  design (its top module and everything under it). A module's right-click menu no longer offers Create Test Bench
  (Wizard): test benches are made on the Test page.
- **Simulation tree:** a module's row shows [Waveform] (the simulation's view) and its HDL, not its drawing; the HDL badge
  opens the file right there in Simulation.

In detail:

- **Tasks ▸ Design: Check Design beside Close Project (#1329):** the bar under the Design tree runs Check Syntax of the
  project's top module, whatever the tree selects; it is off with no project or no top module. The classic interface has
  no such bar.
- **Tasks ▸ Design: no Create Test Bench (Wizard) in a module's right-click menu (#1330):** the Tasks interface's test
  benches are made on the Test page; the classic interface keeps the item and its Processes panel's entry.
- **Simulation tree: [Waveform] in place of the drawing's badge; the HDL badge opens the file in Simulation (#1332):** the
  rows show [Waveform] (marked, the simulation's view: its instance selected, the waveform in front) and their HDL's
  badge, which opens the file in the Tasks interface's Simulation task (a document's task: the one it was opened in,
  `openFile`'s `task`, else its id's).
