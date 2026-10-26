In detail:

- **CI: WebKit's install timed apart from its tests (#1559):** Playwright's WebKit and its system packages are installed
  in a step of their own (25 minutes: a slow package mirror took 13), the memory test in its 15.
