In short:

- **Print the waveform:** in SSim, Print shows the signals' names and values, every row's wave over the time range
  shown, the time ruler, the cursor and the markers, on a white background, with the cursor's time and the range.

In detail:

- **SSim's print view (#1511):** the wave window is drawn again for the print on canvases of its own (its drawing,
  `isim-draw.js`, with the paper's colours and sizes): every row from the first one, nothing selected, the window's
  own scroll and selection untouched; under it the cursor's time, the range shown, the simulation's time and the
  markers (`web/js/isim-print.js`).
