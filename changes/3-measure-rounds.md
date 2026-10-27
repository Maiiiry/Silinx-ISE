In detail:

- **Device measurements, the recipe for the other dies, part 3 (#3):** `measure.mjs random` writes the random designs ISE
  routes (gen-observe.mjs, as the XC3S250E's), `observe` reads their routes too, `measure.mjs round k` writes the join
  tests' round k (predicted joins, across the joins the earlier rounds confirmed), and `measure.mjs verdicts k` reads
  ISE's verdicts and says whether another round is needed. The XC3S100E's tile probe found the shipped graph's 332
  switch-box tiles exactly. Tests: test/s3e-device.test.js (the XC3S100E's random designs on its 240 CLBs, the rounds'
  folders, the stop on a round with no join).
