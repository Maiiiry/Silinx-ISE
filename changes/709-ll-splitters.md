In detail:

- **The XC3S1200E's other long-line splitters in the bit database (#709):** the centre column's (CLKV_LL, 36
  switches) and the I/O columns' (CLKL_IOIS_LL / CLKR_IOIS_LL, 28 each), one bit each, measured with ISE
  (`ll-splitters.mjs`), not used by the router yet. ISE's XC3S1200E designs that use them are byte-identical with no
  exception for the splitters' frames. The side DCM's `DCM_CLKFB -> DCM_CLKFB_PINWIRE` loses a bit stage F gave it,
  which was a splitter's. `merge-db.mjs` keeps a type's `noRoute`, which keeps the router off
  the type's own features only (CLKV_LL's clock switches, shared with CLKV, stay routable).
