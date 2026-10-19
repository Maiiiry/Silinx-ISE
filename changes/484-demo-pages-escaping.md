In detail:

- **The developer demo pages escape what they put into HTML (#484):** `web/schematic-demo.html` escapes the
  instance paths, names and module names of its tree (`esc`, quotes too), and `web/sch-editor-demo.html` builds its
  list of top modules with `new Option(…)`: a Verilog escaped identifier (`\x"><img…>`) was markup in both. A UI
  test loads each page with such names (shown as text; injected an `<img>` before), and a unit test refuses a bare
  `${value}` in the HTML sinks of every page of `web/`.
