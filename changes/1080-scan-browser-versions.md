In detail:

- **The private-data scan and browser versions (#1080):** a product's four-part version after its name and a slash,
  as in a User-Agent string (`Chrome/…`), is no longer read as an IP address; an address after `://` or a path's `/`
  still is (scripts/check-private-data.mjs). It replaces #1027's allow-list entry, and test/private-data.test.js
  passes again with research/ink-models' results (#1060).
