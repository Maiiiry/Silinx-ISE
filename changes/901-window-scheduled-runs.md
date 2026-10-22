In detail:

- **The ISE runner's evening window waits for its scheduled runs (#901):** the window closed after any finished run
  of `ise.yml` since its opening, so a run by hand inside it closed it before the scheduled run, which GitHub starts
  hours late and which then found the runner off line. A window opened by the schedule now counts the scheduled runs
  only (`window.mjs` `runs`, `event=schedule`); one opened by hand still closes after a run of either workflow.
  Tests: `test/ise-runner.test.js` (the API's query; a run by hand inside the evening's window, as on 21 October).
- **The runner's daemon started again only once launchd has let it go (#901):** `window.sh open` right after a
  restart unloaded the daemon and loaded it at once, which launchd refused (`5: Input/output error`), leaving the
  runner off line; `serviceCommands` now waits (up to 30 s) for the daemon to be gone before loading it.
