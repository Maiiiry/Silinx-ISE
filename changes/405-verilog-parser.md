In detail:

- **core/verilog/parser.js split: the parser's methods in three parts (#405):** the parser class's generate
  blocks, functions and instances (parser-items.js), statements (parser-stmts.js) and expressions
  (parser-exprs.js) move to modules of their own, assigned to its prototype; its definitions to parser-defs.js
  (parser.js 1461 → 780 lines). No change in behaviour: every Verilog file of the repository, with damaged copies of
  each (400 texts), parses to the same units and errors as before. Tests: `test/verilog-parser-parts.test.js`.
