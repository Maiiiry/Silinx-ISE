In short:

- **Silinx toolchain: every DCM's clock input from its clock pins:** a DCM's CLKIN now takes the dedicated path
  from any of the clock pins that reach it (the Nexys2's clock socket to a bottom DCM, for instance), as ISE does,
  instead of the general routing with a warning; a clock with no LOC goes on the pin ISE would choose.

In detail:

- **The bit database: the pads' dedicated paths to every DCM's CLKIN (#92):** the clock tiles' and DCM tiles'
  switches from every clock pad to every DCM of the four devices, measured with ISE (research/s3e-bitstream:
  `dcm-pads.mjs`, `gen-dcmpad.mjs`, `measure-92.sh`; `measured/learn-15dcm-pad-pips.json`), with a few other DCM
  tile switches those designs use. The placer gives a DCM's clock with no LOC the pad ISE's placer gives it; the
  warning "its CLKIN comes from the pad … through general routing" no longer appears on the Spartan-3E boards.
  New board test `feat_dcm_pads` (Nexys2-1200: B8 and the clock socket U9, two DCMs).
