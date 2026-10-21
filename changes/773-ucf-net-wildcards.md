In short:

- **UCF wildcards in the Silinx toolchain:** `NET "sw<*>" IOSTANDARD = LVCMOS33 ;` (and `*`, `?` anywhere in a NET
  name) now sets the I/O standard, drive, slew, pull and LOC of every port bit it matches, as ISE does.

In detail:

- **NET names with wildcards in the Silinx toolchain (#773):** the packer looked a NET's constraints up by its name as
  written, so `NET "led<*>" IOSTANDARD = LVCMOS33 ;` left those pads in LVCMOS25 (seen in the feat_iob_pair fixture).
  The constraints of each port bit now come from every NET statement whose name matches it (`*` any characters, `?`
  one, ignoring case), each attribute the last statement's that sets it, as ngdbuild does (core/ucf.js
  `portAssignments`; measured with ISE 14.7). Check Constraints reports a wildcard NET that matches no port: an error
  with I/O attributes (ngdbuild stops on one that matches no design object, ConstraintSystem:58), a warning with
  timing ones. feat_iob_pair's pads are now LVCMOS33, its bitstream byte-identical to ISE's.
