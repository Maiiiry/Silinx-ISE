In short:

- **The Tasks interface's message centre:** in View ▸ Interface ▸ Tasks every flow's messages are in the bottom
  panel, with filters by source (Check Syntax, Simulation, Emulator, Synthesis, Implementation, Board) that follow
  the task in front. ISim's console and its `ISim>` command line, and the emulator's Messages box, are there
  too, so the waves and the board get their space. Folded, the panel shows its last line.

In detail:

- **One message centre in the Tasks interface (#798, from #782):** web/js/messages.js, built in that
  interface only (the modern and classic ones keep their Console, ISim's console and the emulator's box).
  - Each Console line says its source. It is read from the processes' headers (`Started : "…"`,
    `=== SILINX STEP …`, iMPACT's operations), and the lines after a header are its process's.
  - The filter follows the task (Implement: Synthesis and Implementation) until the viewer picks one or
    All.
  - ISim's console and the emulator's Messages box are hidden, and their lines are written into the message
    centre.
  - One command line: ISim's commands while simulating (`ISim> run 1 us`), else the command palette with
    the text typed.
  - The Design Summary opened behind a project at its opening no longer brings the Implement task to the
    front (#804's frame).
