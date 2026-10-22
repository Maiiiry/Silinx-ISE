In detail:

- The RTL schematic viewer's code split (#405): its rendering (`web/js/schematic-render.js`), its hover, selection
  and tooltip (`web/js/schematic-hover.js`) and its SVG export (`web/js/schematic-export.js`), out of
  `mountSchematic` (519 → 290 lines); no change in behaviour.
