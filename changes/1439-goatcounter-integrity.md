In detail:

- **The site's usage counter pinned (#1439):** the published site loads GoatCounter's versioned script
  (`count.v5.js`, which never changes) with its published subresource integrity hash and `crossorigin="anonymous"`,
  so that a changed script does not run; the page's policy allows that one URL instead of the host. The loader's
  comment says how to move to a newer version (`scripts/site-analytics.mjs`).
