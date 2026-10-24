In short:

- **Faster circuits from the Silinx synthesis where the critical path ends in a wide function:** the critical path's LUTs
  below it are made shallower: femtorv32 7 % faster, the clock example 5 %, by ISE's timing analyser.

In detail:

- **The critical-LUT resynthesis goes down the path from an end it cannot make shallower (#652):** an end whose function
  is too wide for the resynthesis's forms (more than 8 to 12 signals three levels down) stopped it, though the LUTs on the
  way to it are narrower. Now, once a round makes no end shallower, the rounds go on down the path from such an end
  (through a carry chain too, up to `RESYNTH_RULE.descend`, 40, cells), the first LUT with a form made shallower; those
  rounds are kept only when the critical path is `descendGain` (3 %) shorter at least (`core/lut-resynth.js`). Four
  routings of the corpus and the examples change at Normal, three at High (Silinx's static timing): epfl-router −10.5 %,
  femtorv32-quark −5.5 % (High −8.7 %, 16 slices fewer), the clock example −4.8 %, the vga example +2.0 % at Normal (1–4 %
  faster on other seeds) and −0.8 % at High; the other designs' netlists are the same. By ISE's trce on the 7 changed
  routings: −4.3 % in geometric mean, every bitstream byte-identical to ISE's bitgen with a clean DRC. The synthesis
  takes about 8 % longer at Normal. research/synth-quality/README.md, "Below an end with no shallower form: the descent".
