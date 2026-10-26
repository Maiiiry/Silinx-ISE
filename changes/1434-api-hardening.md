In detail:

- **API hardening (#1434):** on a server exposed to other computers, `?token=` in the address is taken on the
  download links only (`export.xise`, `export.zip`); every other request sends the token in its header, as the
  page does. Every `/api` response says `Cache-Control: no-store` (a project's text leaves no copy in the
  browser's disk cache). `POST /api/projects/import-zip` holds at most 64 MB (the size one entry of a zip may
  inflate to, `core/zip.js`), not 200 MB; a larger upload gets a JSON 413 that says so.
