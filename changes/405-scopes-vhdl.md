In detail:

- **core/scopes.js split: analyzeVhdl's scope helpers in core/scopes-vhdl.js (#405):** a scope opened, a design
  unit's scope and a declaration's type move to a module of their own (analyzeVhdl 312 → 295 lines). No change in
  behaviour: every HDL file of the repository, with damaged copies of each (1122 texts), gives the same scopes,
  symbols and occurrences as before. Tests: `test/scopes-vhdl.test.js`.
