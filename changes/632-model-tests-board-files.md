In detail:

- **The simulation models' example tests and the board's model (#632):** since #622 the flow writes the board's model
  beside a model made with a test bench's generics; `test/sim-model-lib.mjs` expected only the model's two files and
  `test/sim-model.test.js` ran the test bench on the board's model too, whose entity has no generics (the release CI
  failed 15 tests). The tests now list the board's files and run the test bench on the simulation's model only.
