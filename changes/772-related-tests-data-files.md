In detail:

- **The related tests of a data file (#772):** a pull request that changes only data (the bit database's JSON,
  a device description of `core/fpga/devices/`, an example, a test fixture, a research tool's measurements) runs
  the tests of the modules that read it and of the modules that import those, at any depth, as the tests that
  read it themselves; `scripts/related-tests.mjs` finds the readers in the code (a folder or a file named from
  the module's own place, `path.join(path.dirname(fileURLToPath(import.meta.url)), …)` or
  `new URL('…', import.meta.url)`), so a new file of the database is covered too. The research tools are among
  the sources it reads.
