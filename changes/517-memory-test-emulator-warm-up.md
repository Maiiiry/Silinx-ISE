In detail:

- **The memory test's board emulator measured after its warm-up (#517):** `test/ui/memory.test.js` measured the
  emulator's run and close after 3 warm-up runs, while its page code is still being optimised: measured run by run
  (after the ISim scenario, as in the test), the heap grows 1000, 160 and 76 KB over the first three runs, 17 to 88
  KB a run up to the 11th, then 0 to 5 KB from the 12th on, over 25 runs, in both interfaces: no per-run retention.
  Runs 4 to 8 averaged 42 KB, the 40.5 KB of the CI failure against the 40 KB limit. The scenario now warms up 12
  runs, as ISim's does; the limit is unchanged.
