In short:

- **Edit Stimuli keeps the view:** a click on a wave to change it no longer makes the waveform view jump to the end
  of the simulation; the time scroll, the zoom and the cursor stay where they were.

In detail:

- **Edit Stimuli: the view kept after an edit (#1616):** the stimuli run again after an edit restarted the simulation
  (the view put at time 0) and the run then followed the simulated time to its end and moved the cursor there.
  web/js/isim-stimuli.js puts back the view (time, zoom, Zoom to Full View, cursor) after the restart, and
  web/js/isim-run.js's runTo takes `keepView`: the run does not follow the end nor move the cursor (Zoom to Full View
  still shows the whole simulation). web/js/isim-view.js: the time's scrollbar, shortened by Zoom to Full View, put
  itself at 0 and its scroll event was taken for the user's, which undid the full view; the view now records where
  the scrollbar is after each update. For every edit: a bit, a bus value, a bit of an expanded bus, an expected
  output, the timing (a longer simulation). Test: test/ui/stimuli.test.js (modern and classic interfaces).
