In detail:

- **A gate-level model's comparisons with a constant found before its tables (#670):** core/compiled-tables.js now
  recognizes a model's comparisons of a counter with a constant (LUTs of 4 bits each and the LUT of their results)
  in a pass of their own, before the tables. Each is one equality, and the logic beneath it no longer goes into a
  table: clock's model has 8 500 words of tables instead of 30 000. In Node, clock's post-synthesis model runs about
  9 % faster and stopwatch's about 4 %, the others the same. In Chrome stopwatch's runs about 18 % faster. Measured
  under load, against main, interleaved. Two words compared bit by bit (a ^ b = v) as one equality was tried and
  was slower: pong and blinky about 10 %.
