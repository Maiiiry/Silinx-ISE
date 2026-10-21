In detail:

- **mountISim split, eighth part: the wave window's pointer and keys in web/js/isim-input.js (#405):** the names
  column's selection, twisties, drag of rows, column widths, double click and menu, the waves' cursor and markers
  (dragged, snapped), two-finger scroll and zoom, wheel and menu, and the keys of both move from mountISim to
  mountInput(ctx), called at the same point of the mount; no change in behaviour. Tests: `test/ui/isim-input.test.js`,
  the wave window's input mounted alone on its own canvases.
