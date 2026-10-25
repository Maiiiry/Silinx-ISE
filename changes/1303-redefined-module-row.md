In short:

- A module declared again in another source no longer hides the first one from the Design hierarchy: its row stays,
  marked "redefined in …", and opens its source.

In detail:

- **A redefined module's first source kept in the hierarchy (#1303):** web/js/design.js (renderHierarchy: the source
  whose module the library replaced, the warning "module … redefined" unchanged, a row of its own with a warning icon,
  its drawing's or its file's). Test: test/ui/hierarchy.test.js (an HDL file, a schematic).
