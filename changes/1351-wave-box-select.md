In short:

- SSim: several signals selected at once by a selection window, dragged over the values column (or from under the
  signals); Ctrl/Cmd adds to the selection. A drag on a signal's name still moves it.

In detail:

- **A selection window in the wave window (#1351):** web/js/isim-input.js (boxSelect: the rows the window crosses
  selected; a click without a drag selects the row under it), web/css/isim.css (its look). Test:
  test/ui/isim-input.test.js.
