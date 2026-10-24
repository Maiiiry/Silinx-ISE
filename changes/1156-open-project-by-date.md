In short:

- **Open Project, the latest first:** the projects listed by when each was last changed or opened, the newest first,
  with that date in a last column (Last Used).

In detail:

- **Open Project by date (#1156):** each listing of the projects says when each last changed (the server: its newest
  file, the build's outputs aside; the browser's storage: its last write; a folder on the disk: its project file's
  date), the app remembers when each was opened (localStorage silinx.opened), and the dialog sorts by the later of the
  two (web/js/project-store.js byLastUsed), the date shown as 2026-10-24 15:07.
