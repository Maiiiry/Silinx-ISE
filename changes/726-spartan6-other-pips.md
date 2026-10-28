In detail:

- **Spartan-6: the routing bits of the I/O, block RAM, DSP and clock tiles (#726):** research/s6/db/s6-pips-other.json,
  measured with ISE by PIP drop on the examples ISE routed on both boards (research/s6/gen-pipdrop6.mjs, ana-pipdrop6.mjs):
  370 PIPs (333 of them, the sites' pins, with no bits), the bits placed by the device grid's columns and rows. Tests:
  test/s6-pips.test.js.
