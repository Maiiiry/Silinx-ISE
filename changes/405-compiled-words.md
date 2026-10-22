In detail:

- **core/compiled-words.js split: wordLevel's cells of one bit and its registers (#405):** the cells of one bit
  with the carry chains (compiled-words-bits.js) and the registers proposed (compiled-words-regs.js) move to mounts
  of their own, called where they were (wordLevel 428 → 288 lines). No change in behaviour: the 82 gate-level
  netlists the compiled simulator's and models' tests make give the same word-level netlists as before. Tests:
  `test/compiled-words-parts.test.js`.
