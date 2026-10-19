In detail:

- **Web client, the rename fallback for older servers removed (#489):** `api.renameFile` calls the server's
  rename operation only; the copy, delete and project-list fix-up it did for a server without that operation
  (dead code: client and server ship together) and the error's `unsupported` flag are gone.
  `test/server-api.test.js` checks the client.
