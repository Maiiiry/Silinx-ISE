In detail:

- **Toolchain Settings' command-line values checked when saved (#1433):** `docker.platform` must be `os/arch`
  (`linux/amd64`, `linux/arm64/v8`) or empty, `programmer.tool` one of the programming tools or empty, and
  `programmer.cable` / `programmer.device` cable or device names (as a request's own are), through the API
  (400) or the configuration file; the tools' names and the values' shape in `server/programmer-values.js`,
  shared by `server/programmer.js` and `server/toolchain.js`.
