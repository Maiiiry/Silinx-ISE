In short:

- **Language Templates in the HDL editor only:** the Edit menu no longer lists them; they are the editor's
  Templates ▾ button and its context menu, where the error hints now send you.

In detail:

- **Edit ▸ Language Templates removed (#703):** the templates stay in the HDL editor (its Templates ▾ button and its
  context menu's Language Templates); the error hints that sent to the menu item (core/hints.js, in English and
  Portuguese) name the editor's button. Tests: test/ui/editing.test.js (the Edit menu without it, in both
  interfaces; the editor's button inserts a template), test/hints.test.js (no hint names the menu item),
  test/ui/app.test.js (the menu test's list).
