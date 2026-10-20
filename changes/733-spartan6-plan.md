In detail:

- **The Spartan-6 open toolchain's plan (#733, #1):** `research/s6/README.md`: what the Nexys3 (XC6SLX16) and the
  Atlys (XC6SLX45) need that the Spartan-3E flow lacks (the SLICEX / SLICEL / SLICEM slices, CARRY4, RAMB8BWER /
  RAMB16BWER, DSP48A1, the clocking, the I/O, the routing fabric, the UG380 bitstream), how each part is measured
  with ISE, the order of the work and its issues (#720–#733); the scripts of the first measurement night, checked
  without ISE: the work folder of the examples on both boards and their open-synthesis netlists (`night1.mjs`),
  the ISE runs (`ise-s6.sh`, `night1-remote.sh`), a reader of the Spartan-6 `.bit` (`bits6.mjs`) and the summary
  of the results as Silinx's own record (`summarize-night1.mjs`).
