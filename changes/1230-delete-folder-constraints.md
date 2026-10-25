In detail:

- **Delete Folder in the local server: the deleted UCF is not the constraints any more (#1230):** server/projects.js
  `deleteFile` clears `constraints` when it is under the deleted path, as the browser store does, so a UCF added
  later is adopted and Edit Constraints does not recreate the deleted one.
