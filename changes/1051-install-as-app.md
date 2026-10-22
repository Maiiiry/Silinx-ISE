In short:

- **Silinx as an app:** Chrome and Edge offer to install the site (*Install app*; *Add to Home screen* on an
  Android tablet or a classroom's interactive display). It opens in a window of its own, with no address
  bar, and once a project has been opened it opens and implements with no network too.

In detail:

- **The site installable, the page kept for offline use (#1051):** the site's `index.html` links a web app
  manifest (`manifest.webmanifest`: standalone, started and scoped in the edition's folder, so that the
  stable edition and `dev/` are two apps, each with its own storage as before; icons drawn by
  `scripts/pwa-icons.mjs`) and registers a service worker (`sw.js`, from `web/js/sw.js`) scoped to that
  folder: the page from the network first, its copy when there is none; the manifest and icons kept; the
  versioned assets read from their cache (#967), Yosys's bundle among them, which its workers import
  rather than fetch; nothing else intercepted (`version.json`, GitHub's API, the usage counter, the
  root's `dev/`). The downloaded `Silinx-ISE.html` and the application have none of it
  (`scripts/pwa.mjs`, `web/js/sw-policy.js`, `web/js/pwa.js`).
