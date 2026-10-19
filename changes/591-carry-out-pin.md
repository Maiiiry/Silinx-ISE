In short:

- **Silinx toolchain, faster comparators and counters:** a carry chain's result read by logic now leaves the
  slice as ISE's map does, through the carry multiplexer's own output, and the chain's stages that only pass
  the carry on are left out (blinky 7.24-7.61 -> 6.43-7.02 ns on the four devices, 3 slices fewer; ISE's own
  flow: 6.7 ns).

In detail:

- **Pack: a carry chain's result through XB / YB, the open flows' default (#591):** every XB / YB -> OMUX
  switch is now in the bit database of the four devices (XBUSED / YBUSED set no bits), so the open flows (the
  app's, `open-flow.mjs`, the design corpus's, the synthesis's slice count) pack with `carryOut: 'pin'`, as ISE
  does, instead of one more chain stage whose XOR brings the carry out through X / Y: CIN -> XB is 0.13 ns where
  that stage's CIN -> Y took 0.88. `carryOut: 'xor'` stays as an option.
- **Pack: a carry stage whose select is the constant 1 is left out (#591):** it passes its carry in (O = CI); its
  loads read the carry in instead, unless a sum (XORCY) reads that carry in. blinky's 10-stage comparator against
  a constant ended in six such stages. `stats.carryPass` counts them.
- **Static timing: XB as the F stage's carry (#591):** CIN -> XB and the F side's inputs -> XB are half of CIN -> COUT
  (Tbyp / 2) short of COUT, as the post-place & route model (its SDF) splits the carry chain: the two agree.
- **blinky's test bench: the invert check a clock period after the switch (#591):** the path sw(3) -> logic -> LED pads
  is combinational, about 8-10 ns on the post-place & route model (pads and routing), and half a clock period was not
  always enough: another placement failed it.
