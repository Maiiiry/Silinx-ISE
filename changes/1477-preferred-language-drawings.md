In short:

- **Preferred Language switches the drawings:** changing a project's Preferred Language in Design Properties makes
  every schematic, ASM chart, state diagram, truth table and Petri net's HDL again in that language (`.vhd` ↔ `.v`),
  the old file removed; the HDL written by hand stays as it is.

In detail:

- **Design Properties: the Preferred Language changed, every drawing in it (#1477):** each drawing gets the new
  language and its generated HDL file is made again in it, the file in the other language removed, as when its
  editor's HDL language changes; the project's file list, the drawing's link, an open editor and the Design pane's
  badges follow, the top module and the constraints as they were. A drawing with errors gets the language, its HDL
  made in it once it has none. `drawingInLanguage` (core/view-hdl.js) makes a drawing in a language, also used by
  the editors' language change.
