In short:

- The site's development edition (dev/) keeps its own settings: changing the interface, the theme, the language or
  any other setting there no longer changes the stable edition's, nor the other way round.

In detail:

- **The development edition's own settings (#1243):** web/js/prefs.js (prefKey: on the site's dev/, every setting
  kept in localStorage under `silinx.dev.*`; the stable edition and the application keep their keys, so no setting
  is lost), used by the keys of the interface and theme (modern.js, and index.html's early script), the language,
  the drawer and the narrow panels, the recent / open / last projects and each project's view, the Tasks
  interface's arrangement, the splitters, the emulator, the schematic options, the lint switch, the ink samples,
  the emulation engine and Check for Updates; the projects, the workspace folder and the service worker were
  already kept apart. test/ui/harness.js sets the dev edition's interface key too. Tests: test/web-prefs.test.js,
  test/ui/standalone.test.js; the early script's tests (test/tasks.test.js, test/modern.test.js, test/web-narrow.test.js) read it with the dev edition's keys too.
