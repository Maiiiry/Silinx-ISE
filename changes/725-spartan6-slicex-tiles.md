In detail:

- **Spartan-6: the LUT and slice bit database complete (#725):** a SLICEX's flip-flops' SRINIT bits measured by tile
  type (research/s6/gen-slice6.mjs --tiles; db/xc6slx16-slice-full-clexl13.json and -clexm.json): they are in minor 20
  of the column, 6 or 7 frames before the slice. With them every slice of the seven examples ISE implemented on the
  Nexys3 and the Atlys is predicted bit for bit by research/s6/check-slice6.mjs (650 tiles), and no bit of the
  slices' frames is left unexplained. Tests: test/s6-slice.test.js, test/s6-check-slice.test.js.
