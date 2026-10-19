In short:

- **Check for updates at start-up, a setting:** Help ▸ Check for Updates at Start-up (on by default) turns the
  start-up check off; nothing is then asked of GitHub until Help ▸ Check for Updates… is used. About says what
  the check reaches.

In detail:

- **A setting to turn off the update check at start-up (#488):** Help ▸ Check for Updates at Start-up, a checked
  menu item kept in the browser's storage (`silinx.updateCheckOnStart`): off, `checkUpdatesOnStart` asks
  nothing of api.github.com or raw.githubusercontent.com and writes one line in the console; Help ▸ Check for
  Updates… stays manual. The About dialog's "Update check:" row says what the start-up check contacts (the
  version only, the published site asks only itself) and where it is turned off. Portuguese labels; a UI test in
  both interfaces (off: no request leaves at start-up, the manual check works; on again: the start-up dialog).
