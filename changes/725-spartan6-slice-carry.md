In detail:

- **Spartan-6: the carry, F7 / F8 and the 5-input flip-flops' settings (#725):** research/s6/db/xc6slx16-slice-full.json,
  measured with ISE with the carry chain, F7 / F8 and the 5-input LUTs and flip-flops in the base slice
  (research/s6/gen-slice6.mjs --full): CY0, PRECYINIT, COUTUSED, the outputs' O5, the 5-input flip-flops' SRINIT. With
  the earlier rounds every slice setting ISE writes is measured. Tests: test/s6-slice.test.js.
