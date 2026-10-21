In detail:

- **sch-editor.js split, second part: the schematic's drawing in web/js/sch-svg.js (#405):** the SVG of a symbol (its
  body, pins and texts, placed and turned, and its datasheet drawing), of an I/O marker, a wire's hops and its runs in
  line move from sch-editor.js to a module of their own; no change in behaviour. Tests: `test/web-sch-svg.test.js`, the
  drawing against the document's geometry.
