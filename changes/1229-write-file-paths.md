In detail:

- **The server's file route takes a path as the project lists it (#1229):** server/projects.js `writeFile` stores
  `./src/a.vhd` and `src//a.vhd` as `src/a.vhd` (the same file was listed, and synthesised, several times) and refuses
  `silinx.json` (written by the project's own routes), as the browser store does.
