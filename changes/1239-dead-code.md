In detail:

- **Dead code removed (#1239):** constants and helpers nothing read (core/schdoc.js, stimuli.js, symdocs.js,
  fpga/s6/place.js, web/js/implement.js's `STEP_TOOL`, eight test helpers) and the re-exports the #405 split left in
  web/js/app.js and core/scopes.js, which no module imports.
