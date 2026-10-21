In short:

- **The Design Summary of a Spartan-6 project:** before an implementation it lists the part's own resources (RAMB16BWER
  and RAMB8BWER, DSP48A1, BUFG/BUFGMUX, BUFIO2, BUFH, DCM, PLL, MCB) instead of the Spartan-3E's.

In detail:

- **One model of each device's resources (#790, part of #787):** core/resources.js describes, for every part of the
  device database, the resources it has and how many: the common ones (flip-flops, LUTs, slices, distributed RAM, user
  I/O per package) and the family's own (Spartan-3E: RAMB16, MULT18X18SIO, 24 BUFGMUX, DCM; Spartan-6: RAMB16BWER /
  RAMB8BWER, DSP48A1, 16 BUFGMUX, 32 BUFIO2, BUFH, DCM, PLL, MCB), each with its label in English and Portuguese, its
  line of ISE's MAP report and the UNISIM primitives that use it. `resourcesOf`, `resourceCount`, `familyResources`,
  `primitivesOf` and `resourceOfPrimitive` are its API, for the schematic primitives, templates, wizards, reports and
  checks of #791-#796. The Design Summary reads it instead of its hard-coded 24 BUFGMUXs. Tested against DS312's and
  DS160's tables, the shipped devices' sites and ISE's MAP report of the LX16 and LX45.
