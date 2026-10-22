In detail:

- **The private-data scan and browser versions (#1027):** Chrome's four-part version in test/emulate-engine.test.js's
  User-Agent strings is not an address: in the scan's allow-list with its reason (scripts/check-private-data.mjs);
  test/private-data.test.js passes again.
