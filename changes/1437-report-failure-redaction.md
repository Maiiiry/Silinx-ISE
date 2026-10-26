In detail:

- **A scheduled failure's log lines cleaned of computer names, the runner's folders, IPv6 and MAC addresses,
  container ids (#1437):** `scripts/report-failure.mjs` also replaces names under `.local` / `.lan` / `.home` /
  `.internal`, the runner's own name and folders (`RUNNER_NAME`, `HOSTNAME`, `RUNNER_DIR`, `RUNNER_TEMP`,
  `RUNNER_WORKSPACE`, `GITHUB_WORKSPACE`, `RUNNER_TOOL_CACHE`, when set), `/Volumes/<name>`, IPv6 (but `::1`) and
  MAC addresses and 12 / 64-digit hexadecimal ids, and a line that still matches a rule of
  `scripts/check-private-data.mjs` is withheld from the issue (a last line says how many were).
  `test/report-failure.test.js` checks each.
