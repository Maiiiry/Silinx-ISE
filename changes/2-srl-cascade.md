In short:

- **Shift registers chained through Q15:** SRLC16E instances whose Q15 drives the next one's D (up to four) build
  with the Silinx toolchain, packed on the two SLICEMs of a CLB as ISE packs them.

In detail:

- **SRLC16E chains through Q15 in the Silinx toolchain (#2):** the cascade between the two SLICEMs of a CLB (DIG_MUX =
  SHIFTIN, SHIFTOUTUSED, the switch SHIFTOUT2 -> SHIFTIN0) measured with ISE on the four devices (no bits: every bit of
  ISE's bitstreams explained, the switch removed by codewords changes none; the multiplier cascade's bits were known
  already); the packer packs a chain of up to four as ISE's map does (a macro of the two slices, the SHIFTOUT -> SHIFTIN
  net) and refuses a longer chain or Q15 into anything else; a new open-flow fixture, feat_srl_chain.
