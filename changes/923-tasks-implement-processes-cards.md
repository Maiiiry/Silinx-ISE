In detail:

- **The Tasks interface's Implement: its own processes only; the Design Summary's cards no longer overlap (#923):**
  Emulate on Board and Configure Target Device, the Emulate and Program tasks', are left out of Implement's
  processes (each process row now carries its id, `data-proc`). The summary's cards are a wrapping row rather than a
  grid, which left each table's caption out of its height, so the cards overlapped. The modern and classic interfaces
  are unchanged.
