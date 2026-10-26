In short:
- Find in Project: the toolbar's search (Ctrl+Shift+F) finds across every source of the project, the drawings too, and replaces (one result or all, with Undo).

In detail:
- Find in Project: the toolbar's Find (and Edit ▸ Find in Project…, Ctrl+Shift+F) opens a page that searches the project's HDL, constraints, test benches, data files and the drawings' texts (names, labels, expressions, notes), with match case, whole word and regular expressions; its results by file and line (a drawing's by where in it), a click opening the place; Replace one result or all of them in the text sources, Undo Replace putting them back; an HDL generated from a drawing is found and marked, replaced in its drawing. Matching: core/find.js. An editor's own Find stays in its bar (#1430).
