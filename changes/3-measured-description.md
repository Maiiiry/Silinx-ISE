In short:

- **The open flow on a measured device description:** a description of the XC3S250E built only from Silinx's own
  measurements routes all seven examples, each bitstream byte-identical to ISE's.

In detail:

- **Device measurements, steps 5-6 (#3):** `chip.mjs` builds the whole chip's description from the measurements (the
  bit database's features, ISE's routes, the arc probe, the join tests); the clock spine's joins tested from the global
  buffers (`BUFGSRC`), the carry chain, the slices' CE / SR and wide-multiplexer pins observed (`gen-obscarry.mjs`,
  `gen-obsslice.mjs`, `gen-obsmux.mjs`). The seven examples routed on it pass `scripts/check-open-flow.mjs`: DRC clean,
  no warning, byte-identical to ISE's bitgen.
