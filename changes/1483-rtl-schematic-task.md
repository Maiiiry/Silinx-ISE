In short:

- Tasks interface: View RTL Schematic asked from Design (a module's menu, View ▸ RTL Schematic) opens the schematic in
  Design; from Implement's Synthesize, in Implement, as before.

In detail:

- **The RTL Schematic opens in the task it is asked from (#1483):** in the Tasks interface the RTL Schematic was
  Implement's document by its id (#1063), so View RTL Schematic from Design's hierarchy switched to Implement. It now
  keeps the task it was asked from (`openSchematic`'s `task`, the document's `task` as an HDL file's from the
  Simulation tree, #1332): Design's menus open it in Design, Implement's Synthesize in Implement. A schematic reopened
  with the project goes to Implement as before. The Technology Schematic and the FPGA view are only asked from
  Implement's processes (or the View menu, a run's output): they stay Implement's.
