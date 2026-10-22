In detail:

- **A flaky UI test fixed (#894):** test/ui/clipboard.test.js clicked the FSM's state before the editor had fitted
  its view (a frame after it is drawn), so the click missed it now and then. It now waits, as the Petri net step
  already did, until the state's position is the same twice in a row, and for the state to be selected.
