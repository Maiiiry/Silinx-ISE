In detail:

- **Spartan-6 packer: a 5FF's D through O5 (#1143):** a storage element packed on a 5FF (A5FF … D5FF) with its
  D from outside the slice now takes it through the position's O5 as a route-through of a LUT input (as ISE's
  map does), only when O5 is free and the O6 LUT leaves it an input; it was on the bypass input, which a 5FF does
  not have (the slices' definitions: a 5FF's D is O5's). `checkSlice` refuses a 5FF whose D is not O5's. The
  examples' slice counts are unchanged; stopwatch's four such 5FFs are now legal.
