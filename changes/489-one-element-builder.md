In detail:

- **Web client, one element builder (#489):** the six `h()` builders (`ui.js`'s with `html` and style objects;
  the ASM chart, schematic editor and symbol information's with `text`, `value` and `checked` as properties;
  the Board Emulator's; ISim's positional `h(tag, class, html)`) are replaced by one, `h` of `web/js/dom.js`,
  which `ui.js` re-exports. It takes every key the copies took: `value` and `checked` set both the attribute and
  the property, an event key is a listener only for a function, and children nested in arrays are flattened
  with null / undefined / false left out. ISim's calls are written with the attributes object.
  `test/ui/dom.test.js` checks it in the browser, `test/web-dom.test.js` that no module defines one of its own.
