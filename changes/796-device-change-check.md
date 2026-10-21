In short:

- **Changing the target device checks the design first:** in Design Properties, a new device (or family) that the
  design does not fit is said before the change: the modules that use a primitive the new family lacks, with its
  equivalent (MULT18X18SIO → DSP48A1 on a Spartan-6, DSP48A1 → MULT18X18SIO on a Spartan-3E…), and the resources
  over the new part's ("5 block RAMs needed, the XC3S100E has 4"). The device can still be changed.

In detail:

- **A change of the target device checked against the design (#796, part of #787):** core/resource-check.js's
  `deviceChangeIssues` takes the design's primitive instances (its elaborated hierarchy, the drawings' HDL among the
  sources), its top's ports and the last synthesis's or MAP's resource use (carried over to the new family: a
  RAMB16_S* is a RAMB16BWER, a RAMB8BWER takes a whole RAMB16), and names each primitive the new family lacks with
  its equivalent and each resource over the new part's count. Design Properties shows them in a "Device Change"
  dialog (Change Device or Cancel; in Portuguese too) and logs them as warnings when the device is changed.
