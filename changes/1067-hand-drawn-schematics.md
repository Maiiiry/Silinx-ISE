In short:

- **Hand-drawn schematics:** in the schematic editor, *Handwritten…* reads a combinational circuit drawn with a pen,
  a finger or the mouse (the gates, the wires, the names), offline, lists its gates and names to correct, and makes it
  into the schematic.

In detail:

- **A schematic drawn by hand (#1067, stage 3 of #1055):** `core/ink/schematic.js` reads the drawing: the wires are the
  square open strokes; the gates the tall groups of the other strokes shaped as a gate (their outlines in
  `core/ink/gates.js`, $P templates: AND, OR, XOR, a triangle; a letter is not one), with the square lines all in their
  box (an AND's or a triangle's back) and a small ring at the tip (an inversion: NAND, NOR, XNOR, NOT); a wire end on a
  gate's left side is one of its inputs (from the top), at its tip its output, on another wire a junction, at a name
  the net's name (an input, or an output when a gate drives the net); the errors (a gate without its wires, the inputs
  a gate has, outputs joined, a wire from nowhere) and warnings (an output without a name, a name or a wire end astray).
  `core/ink/schematic-doc.js` makes it a schematic: Silinx's symbols where the gates were drawn, the I/O markers at the
  names, each net routed square by `routePath` (#1052's router). The Handwritten Schematic dialog
  (`web/js/ink-schematic-dialog.js`) lists the gates with their types and the names, to correct, and replaces the
  editor's drawing in one edit (`web/js/sch-ink.js`). Held-out circuits (`core/ink/synth-schematic.js`) all read with
  their logic, 22 of 24 with every name, their netlists clean, their HDL simulating to their truth tables
  (`test/ink-schematic.test.js`).
- **The slant of the writing** is now measured on its nearly upright parts only, and not on a single letter's
  diagonal (a Z read as an E, #1067).
