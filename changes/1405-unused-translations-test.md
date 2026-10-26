In detail:

- **A test for translations of texts the interface no longer has (#1405):** test/web-i18n.test.js fails on a key of
  the Portuguese dictionary that no string or template literal of web/, core/ or server/ has (each `${…}` of a
  template any text), read by a small tokenizer (test/js-literals.js); the six such keys left are removed.
