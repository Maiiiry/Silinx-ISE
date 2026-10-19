In short:

- **The site and the single file, safer:** they carry a Content-Security-Policy, as the local server's pages
  do; a downloaded Silinx-ISE.html fetches the files of its own version from the site.

In detail:

- **Static editions: a Content-Security-Policy and versioned remote assets (#487):** `scripts/build-standalone.mjs`
  writes a `<meta>` policy into the single file and the site's pages (`server/csp.js`, shared with the server's
  header: the inline scripts by their hashes, scripts and fetches from the page's origin and the assets' site,
  workers from Blobs; no `frame-ancestors`, which a `<meta>` cannot carry); `scripts/site-analytics.mjs` adds the
  usage counter to it. The assets are versioned: `assets/<version>/` (a development build `dev-<commit>/`) for the
  device descriptions and the bit database, `assets/vendor/yowasp-yosys/<Yosys's version>/` shared; the page
  knows its folder and the single file the site it fetches them from (`--assets-url`). The Pages build keeps the
  last five releases' assets (`--assets-only` from each tag) and the unversioned folders of the files
  downloaded before. The print page no longer has an inline script (the opener prints it): a page written into
  a new window keeps the opener's policy, which runs no inline script.
  A Content-Security-Policy violation now fails any UI test; the standalone tests run in Firefox and WebKit too.
