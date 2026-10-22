In detail:

- **core/vhdl/parser.js split: declarations, concurrent and sequential statements (#405):** the parser's
  declarations (parse-decls.js), concurrent statements (parse-concurrent.js) and sequential statements (parse-seq.js)
  move to modules of their own, methods of the parser as its expressions already were (parse-expr.js); its shared
  definitions and helpers to parse-defs.js and parse-helpers.js (parser.js 1720 → 517 lines). No change in
  behaviour: every VHDL file of the repository, with damaged copies of each (1096 texts), parses to the same units
  and errors as before. Tests: `test/vhdl-parser-parts.test.js`.
