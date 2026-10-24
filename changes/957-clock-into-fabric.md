In detail:

- **Bit database: a clock into the fabric (#957):** every DCM output's switch into its tile's output multiplexer
  (`DCM_<output> -> OMUXk`) and every top and bottom global buffer's (`CLKT_GCLK_MAINk -> CLKT_TO_OMUXj`, CLKB's), 636
  unknown before, measured with ISE (`research/s3e-bitstream/gen-clkdata.mjs`, `measure-clkdata.sh`: the switches added
  as branches to designs ISE routed, 714 xdl + bitgen runs). The measured designs are byte-identical to ISE's bitgen;
  `feat_clock_data`, a global clock and a DCM output read as data, is byte-identical with a clean DRC.
