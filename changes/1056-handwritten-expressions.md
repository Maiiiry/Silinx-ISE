In short:

- **Handwritten expressions:** write a Boolean expression such as `F = A·B' + C` with a pen, a finger or the mouse
  (*Handwritten…* beside a truth table's expression, and in the New Source wizard's Truth Table, which then makes the
  table from it); Silinx reads it offline and shows the text to correct before it is used. *Teach Silinx my
  handwriting* adds your own way of writing a symbol.

In detail:

- **Handwritten Boolean expressions, Silinx's own offline recognizer (#1056, stage 1 of #1055):** `core/ink/` (pure,
  no dependencies, no network): the $P point-cloud recognizer (`pdollar.js`, with the amount of ink as a second
  measure); the ink split into characters by its layout (`segment.js`: the slant made upright, strokes that overlap or
  meet, the dot of an i or a j, a prime apart, overbars); the expression read (`expression.js`: primes and dots by
  their place, `=` by its two lines, capital or small by the letter's height, the symbols written alike chosen by
  `parseExpr`, brackets balanced, an overbar as NOT); built-in templates made by `scripts/ink-templates.mjs` from a
  skeleton font (`font.js`, `synth.js`) into `core/ink/templates.json`; the user's samples as preferred templates
  (`templates.js`). The Handwritten Expression dialog (`web/js/ink-dialog.js`, its pad `web/js/ink-pad.js`: pen,
  touch and mouse, a resting hand ignored once a pen writes): the truth table editor's *Handwritten…* fills the
  column of the output named; the New Source wizard's Truth Table has an optional expression, typed or handwritten,
  that gives the table's inputs, output and column. Held-out handwriting (other seeds, stronger distortions than the
  templates') is read at 99% glyph by glyph (221 of 222) and 90% expression by expression (76 of 84,
  `test/ink.test.js`).
