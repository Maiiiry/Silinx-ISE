In detail:

- **MCP `write_file`: Silinx's own files by any spelling (#1233):** the guard on `silinx.json` and `build/` tests the
  path as the project lists it, so `./silinx.json` or `src/../silinx.json` no longer pass; the file written is
  reported by its plain path.
