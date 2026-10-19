In detail:

- **Web client, one HDL highlighter (#489):** the three highlighters of the drawing editors' code panels (the
  ASM chart's and the state diagram's, with one mixed VHDL / Verilog keyword set; the schematic editor's for
  Symbol Information, with its own sets and classes) are replaced by `highlightHdl(code, lang)` of the new
  `web/js/highlight.js`: each language's keywords (the union of the three sets), comments of that language,
  literals, Verilog attributes and state constants, as `tk-*` spans. Symbol Information's HDL now uses the same
  classes (its keywords and comments look as before) and colours a keyword only in its own language.
  `test/web-highlight.test.js` checks it, `test/ui/symbolinfo.test.js` the keywords shown in both languages.
