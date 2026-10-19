In detail:

- **Nightly: Yosys's test designs in three jobs, a file of many modules in parts (#536):** the second of the two
  jobs ran past its hour on 18 October, `hana/test_intermout.v` (33 top modules, two netlists each) alone on one
  worker at the end and over its 1500 s (985 s the night before; the open synthesis tries more mappings since,
  about 25 % more time on it, and the runner was slower). `test/corpus/run-corpus.mjs` now runs a file of more than
  8 top modules in parts the workers share (every n-th module each; the limit is each part's), a file expected to
  fail as a whole (`hana/hana_vlib.v`) still whole; the nightly and the Yosys update's comparison run it in three
  jobs (`--shard k/3`).
