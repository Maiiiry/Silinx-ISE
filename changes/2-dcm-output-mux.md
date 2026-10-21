In short:

- **DCM outputs on any global buffer:** every output of every DCM of the Spartan-3E devices now reaches its four global
  buffers in the Silinx toolchain (before, CLK90, CLKDV, CLKFX180 or CLK2X180 often reached none), so a Clocking
  Wizard module places on the DCM nearest its clock.

In detail:

- **Bit database: the DCMs' output multiplexer measured (#2):** the switches `DCM_<output> -> OMUXk` of the 8 DCM tile
  types, 194 of which were unknown, measured with ISE on designs that route every output of every DCM through each
  line of its multiplexer (`research/s3e-bitstream/gen-dcmomux.mjs`, `measure-dcmomux.sh`: 35 designs, 700 xdl + bitgen
  runs), with the clock tiles' switches those designs route (`measured/learn-16dcm-omux-pips.json`, 250 features). The
  35 designs are byte-identical to ISE's bitgen. Every DCM output of the four devices reaches its four global buffers
  on known switches; the Clocking Wizard's board tests on the XC3S100E now use its top DCM.
