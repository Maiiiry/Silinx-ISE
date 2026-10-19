In detail:

- **mountISim split, first part: the Console and command line (#405):** ISim's Console (the simulator's messages,
  the commands' output) and its command line with the commands (run, restart, isim force, wave add, show, zoom,
  marker, help) move from `mountISim` in `web/js/isim.js` to `mountConsole(ctx)` of `web/js/isim-console.js`, called
  where the code was, with no change in behaviour. `test/ui/isim-console.test.js` checks each command, its output and
  errors, the simulator's messages and the history keys, on the console mounted alone.
