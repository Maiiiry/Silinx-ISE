In detail:

- **The Spartan-6 slice model and packer (#721, #1):** `core/fpga/s6/pack.js` packs a netlist of the open synthesis
  for the Spartan-6 into SLICEX, SLICEL and SLICEM slices: four LUT6 positions (O6, and O5 when LUT combining is on,
  off by default as in ISE's map), eight storage elements of one control set (latches in the FFs only, never beside
  a 5FF), carry chains as columns of SLICELs with their LUTs at S and DI by O5 or the bypass inputs, the F7AMUX /
  F7BMUX / F8MUX with their LUTs, the SLICEM's RAMs and shift registers by clock, write enable and write address, the
  multiplexed outputs; `checkSlice` checks every rule. Every example packs into legal slices for the XC6SLX16; the
  comparison with ISE's map comes with the first measurement night.
