In detail:

- **Every interpolation into the interface's HTML / SVG strings checked (#1443):** a test scans web/js for the `${…}` of
  every markup template (innerHTML, `html:`, the drawings' SVG) and requires each to be escaped (`esc`), a number, a
  literal or one of a few listed shapes with their reasons (a coordinate in a numeric attribute, markup made by another
  template); the counts, widths, kinds and names it found written raw now go through `esc`. A drawing whose file holds
  markup where a coordinate or a name should be draws nothing of it (the editors normalize their model when they mount):
  a UI test on the ASM, FSM and schematic editors.
