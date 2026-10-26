In short:

- **Print any document:** File ▸ Print…, Ctrl+P and the toolbar's Print work with whatever is in front: an HDL
  source (its text, numbered), View RTL / Technology Schematic, a truth table's schematic, a Petri net, View
  Implemented Design (the FPGA view), the Design Summary and the reports. The page is light, also in the dark
  theme, and names the project and the file.

In detail:

- **Every document in front prints (#1509):** Print is enabled with any document. A drawing (ASM chart, state
  diagram, schematic, Petri net, a read-only schematic) opens the print dialog of diagrams, its drawing's styles
  read in the light theme and its page's header naming the project and the file; an HDL or UCF source prints its
  text with line numbers, HDL highlighted (the generated, read-only HDL too); any other document prints a copy of
  what it shows (its toolbars and buttons left out, its canvases as images) fitted to the page width, the FPGA
  view's die drawn light and fitted to one page (`web/js/print-doc.js`, `web/js/print-view.js`).
