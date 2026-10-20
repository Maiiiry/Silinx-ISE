In detail:

- **The bit database: every input delay on every pad but the global clock pins (#97):** a pad's delay bits are its own,
  not its neighbours' (every pair of values on the pads of each I/O tile, measured with ISE: `gen-iobdly.mjs`,
  `ana-iobdly.mjs`); IFD_DELAY_VALUE 0-6 and IBUF_DELAY_VALUE 1-12 on every pad, solved with the IOB registers'
  designs; the pads with a dedicated path to a global buffer keep only the delay ISE's map chooses (their other delays
  set bits of the clock tiles, refused). The packer writes the delay ISE chooses, as before.
