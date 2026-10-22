In short:

- **Simulate a truth table's schematic:** the schematic generated from a truth table has the schematic editor's
  Simulate: click its inputs and watch its outputs and wires, the values of the table; the drawing stays read-only.

In detail:

- **The truth table's schematic simulated in place (#946):** read-only blocks editing a drawing, not simulating it:
  the schematic editor's `simulate` option keeps Simulate in a read-only view (the truth table's schematic, opened
  from its Schematic badge), with no editing tool and no edit by keys; a change of the table stops the simulation
  as it redraws the schematic. The RTL and Technology schematics are unchanged. A UI test (modern, classic, Tasks,
  Portuguese) sets every input combination of a table with the switches: the outputs are the table's, every net 0
  or 1, the drawing unchanged.
