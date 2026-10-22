In short:

- The Console no longer shows errors of scripts that are not Silinx's (such as "ERROR: func sseError not found" from a
  browser extension or the host application, after the app stayed open a long time).

In detail:

- **Only Silinx's own failed promises in the Console (#997):** the handler of unhandled promise rejections (#408)
  reports a rejection in the Console and the Errors tab only when its stack has a frame of the app's own scripts (the
  page's origin; the standalone file's folder from `file://`; the page's `blob:` workers), or when it is an Error with no
  frames (one the browser makes). An extension's or an injected script's rejection, and a reason that is not an Error,
  are left to the browser's console (`web/js/own-error.js`).
