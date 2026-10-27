In short:

- **Two documents side by side:** a drawing or a C source and its generated HDL, or any two open documents, in two
  panes of the workspace with a divider between them: *Show Generated HDL Beside* and *Open to the Side* (a tab's
  right-click menu, the View menu); the HDL follows the drawing as it is edited.

In detail:

- **Split editor (#1619):** web/js/split-view.js. A document's tab (its right-click menu) and the View menu: *Open to
  the Side* (*Split Editor*), *Show Generated HDL Beside* (a schematic's, ASM chart's, state diagram's, truth table's or
  Petri net's HDL file, a C source's HDL made in memory), *Close Split*. The document in front is the pane worked in; a
  click in the other pane brings it to the front, a document opened takes the place of the one in front, closing either
  leaves the other. The divider is dragged (a double-click: halves) and its place kept; the pair is kept with the
  project's open documents (a reload comes back split; a C source's HDL now reopens too); a workspace under 720 px stacks
  the panes. The Tasks interface splits a task's own documents (another task's document is shown alone). A C source's
  HDL document follows the C as it is saved. Tests: test/ui/split-view.test.js (both interfaces, Tasks, Portuguese).
