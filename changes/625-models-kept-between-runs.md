In short:

- **A simulation model stays generated:** in the browser edition, a model generated (Emulate or Simulate a
  Post-Synthesis Model, Generate and Emulate) was "not generated yet" again after another run of the flow, such as
  Generate Programming File; it is now kept while its files are in the build. In both editions the board keeps
  running the model with the design's own generics after a later run.

In detail:

- **The earlier runs' models kept (#625):** each run of the browser flow replaced the project's report with its own,
  which lists only the models that run made, though the earlier ones' files were still in the build; the browser
  edition now keeps the earlier runs' models whose files are there (all of them in a workspace folder). The server
  lists the models by their files in build/, but without what an earlier run said of them: it now lists an earlier
  run's board model (#622) when its file was written with the model, not before it, and the console's message says
  "the test bench's" when the run's name of it is not known. Tests: `test/ui/standalone.test.js` (a model, then
  Generate Programming File, then the model again: no dialog, the board's model), `test/ui/open-toolchain.test.js`
  (the same with another model in between, in the full application).
