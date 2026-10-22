In detail:

- **A flaky UI test: the Tasks message centre's (#932):** the test waits for ISim's Sim Time to reach the end of the
  `run 2 us` it typed, rather than reading it once the time first changes (while the run was still going).
