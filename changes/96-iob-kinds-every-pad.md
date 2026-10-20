In short:

- **Silinx toolchain: registers in the IOBs on any pad:** a plain register (no enable, no reset) in an I/O block, and a
  tristate output whose enable comes from the logic, are no longer refused for want of measurements on most pads.

In detail:

- **The bit database: the IOB registers' kinds on every pad, the tristate enable from the fabric (#96, #97):** every
  register kind moved through every pad and every output pad a tristate output (research/s3e-bitstream
  `measure-iobrot.sh`: `gen-iobreg.mjs --rot`, `rt`), measured with ISE and solved together with #44's designs written
  again (334 designs per device, 24 random variants each, every bit explained; held-out variants byte-identical to
  ISE's bitgen). The plain input and output registers and `TMUX:T1` are now measured on every pad that has the
  register. New board test `feat_iob_plain`.
