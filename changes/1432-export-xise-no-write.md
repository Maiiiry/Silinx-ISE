In detail:

- **`GET /api/projects/:p/export.xise` writes nothing (#1432):** the .xise is sent as before but no longer saved into
  the project folder on the way (a GET changes no file); `POST …/sync-xise` writes it on request, as it did.
