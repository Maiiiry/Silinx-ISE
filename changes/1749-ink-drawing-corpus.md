In detail:

- **Copy Drawing and Paste Drawing in the handwriting dialogs, and a corpus of real drawings (#1749):** the
  handwritten expression, truth table and schematic dialogs (Development menu) have Copy Drawing, which puts the pad's
  strokes on the clipboard as text (core/ink/corpus.js: the kind, the devices that drew it, what Silinx read), or
  shows it selected when the browser does not let the page copy, and Paste Drawing, which loads a copied drawing back
  on the pad (one step of Undo) and refuses a drawing of another kind or a text that is not one. A drawing read wrong
  pasted into an issue, with what it should read as (`"expect"`), becomes a case of test/fixtures/ink/ (its
  README says how); test/ink-real.test.js reads every one and fails when fewer read right than the floor of its
  kind. Tests: test/ink-real.test.js (round trip, decoding errors, the schematic's circuit as text), test/ui/ink.test.js
  (copy, paste, Undo, the kind refused, the text shown when copying is not allowed).
