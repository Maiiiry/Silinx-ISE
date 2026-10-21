In detail:

- **core/vhdl/parser.js split: the expressions in core/vhdl/parse-expr.js (#405):** the VHDL parser's expression
  methods (an expression down to its primaries: names, calls, attributes, aggregates, literals) move to a module of
  their own, assigned to the parser's class, with the operator tables they alone use; the small helpers both use go to
  core/vhdl/nodes.js. No change in behaviour: every VHDL file of the repository, and 1488 damaged copies of them, parse
  to the same result as before. Tests: `test/vhdl-parse-expr.test.js`.
