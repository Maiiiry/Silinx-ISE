In detail:

- **Spartan-6: the slice settings without nets (#725):** research/s6/db/xc6slx16-slice.json, measured with ISE: one
  design per slice kind with a base slice and one slice per variant (every option of every element of the primitive
  definitions, research/s6/measured/prim-defs.json, read from the XDLRC by prim-defs6.mjs), compared bit by bit
  (gen-slice6.mjs, ana-slice6.mjs). The flip-flops' modes, SRINIT and SYNC, their sources, and a SLICEM's RAM and SRL
  modes are measured; the settings of the pins (CLKINV, the outputs used, the carry, F7 / F8) need nets and come
  next. The LUT map's bits of a used SLICEL or SLICEM are its neighbouring SLICEX's. Tests: test/s6-slice.test.js.
