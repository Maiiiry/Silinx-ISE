In short:

- **Projects:** a symbolic link in a project folder that leads out of it is no longer followed by the local server.

In detail:

- **The server's project paths confined once their symbolic links are followed (#1234):** server/paths.js (`within`,
  `realOf`), used by `safeJoin` and ISE's build (server/ise.js): a project folder put in the workspace by hand (a
  clone, a copy) with a link to a file outside it is not read, written, copied into the build or sent to the build
  host; a link to a folder of the project itself still works.
