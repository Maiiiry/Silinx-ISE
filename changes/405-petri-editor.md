In detail:

- The Petri net editor's code split (#405): its drawing (`web/js/petri-draw.js`), its side panel
  (`web/js/petri-side.js`) and its bottom panel, the simulation, the HDL and the analysis (`web/js/petri-sim.js`),
  out of `mountPetriEditor` (519 → 278 lines); no change in behaviour.
