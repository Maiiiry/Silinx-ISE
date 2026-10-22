In detail:

- **core/fpga/pack.js split: packWith in thirteen parts (#405):** the packer's parts move to modules of their own,
  each called where its code was: the netlist prepared (pack-prep.js), the slices under construction
  (pack-slices.js), the registers in the IOBs (pack-iobregs.js), the carry chains (pack-carry.js), the wide
  multiplexers (pack-muxes.js), the distributed RAMs and shift registers (pack-mems.js), the LUTs and flip-flops
  (pack-luts.js), the IOB settings (pack-iobcfg.js), the block RAMs (pack-bram.js), the DCMs and multipliers
  (pack-dcm-mult.js), the pads and clock buffers (pack-pads.js), the site pins of the connections (pack-nets.js) and
  the configuration strings (pack-cfg.js) (packWith 1538 → 109 lines; pack.js 1767 → 351). No change in behaviour:
  the 558 packed designs of the packer's, placer's, router's and I/O registers' tests are byte-identical to before,
  as fast. Tests: `test/pack-parts.test.js`.
