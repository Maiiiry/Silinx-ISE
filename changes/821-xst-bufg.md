In short:

- **XST's global buffers by family:** an ISE build of a Spartan-3 project lets XST use the part's 8 global clock buffers
  (24 on the Spartan-3A / 3A DSP / 3E, 32 on the Virtex-4), not 24 on every family.

In detail:

- **XST's -bufg from the device resources model (#821):** server/ise.js reads the part's global clock buffers from
  core/resources.js, which now has them for the Spartan-3 (8 BUFGMUX), 3A and 3A DSP (24) and Virtex-4 (32 BUFGCTRL),
  measured with ISE's device reports; a part outside the database keeps 24. Those families' LUTs are 4-input ones in
  the model (the Virtex-4's were labelled 6-input), and their Design Summary before an implementation shows the global
  buffers.
