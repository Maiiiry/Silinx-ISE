In detail:

- **The cached tools checked against their SHA-256 (#1237):** the build writes each published asset's SHA-256 (the
  device descriptions, the bit database, Yosys) into the page's asset layout; web/js/asset-cache.js checks a copy
  before it keeps or uses it, in the flow worker and the Yosys workers: a cached copy that differs (truncated, or put
  there by another page of the same site) is dropped and fetched again, and a download that differs is not kept.
