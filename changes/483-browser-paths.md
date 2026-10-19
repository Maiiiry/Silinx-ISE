In short:

- **Importing a project in the browser edition:** a zip or bundle whose files or silinx.json point outside the
  project imports what is sound and says, in the console, what was left out.

In detail:

- **Browser edition: every project path normalised, the imported silinx.json too (#483):** `safePath` /
  `cleanPath` (`web/js/project-store.js`) refuse a path that would leave the project (`..`, absolute, `\\host`,
  `C:\`, a control character) and normalise backslashes and `.` segments; every operation of both stores
  (browser storage, workspace folder) and of the project operations (`put`, `readFile`, `writeFile`,
  `renameFile`, `deleteFile`) goes through it, and silinx.json is never written, renamed or deleted as a project
  file. `normalizeProjectJson` puts an imported description in shape (as `normalizeDoc` does for the drawings):
  `files` an array of `{ path, lang, role }` with clean paths, strings for `top` / `simTop` / `constraints`, the
  known `device` fields, objects for `stimuli` / `impl`. `projectFromZip` and the bundle import skip an entry
  that leaves the project; each dropped item is a warning in the console. Unit tests with hostile inputs; a UI
  test importing such a zip in the browser edition.
