In short:

- **Rename Folder:** the files removed from the project stay removed (they came back after their folder was renamed).

In detail:

- **A folder renamed: the excluded files follow (#1228):** server/projects.js and web/js/project-store.js `renameFile`
  remap `excluded` with the files and the constraints (a folder, and a single file); a deleted folder's excluded
  entries are dropped.
