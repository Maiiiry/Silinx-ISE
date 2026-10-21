In short:

- **View ▸ Interface: Modern and Classic** ("Xilinx ISE (Classic)" is named Classic); the Tasks interface is in the
  development builds only, for now.

In detail:

- **The classic interface named Classic; Tasks in the development builds only (#838):** View ▸ Interface's "Xilinx
  ISE (Classic)" is Classic (pt Clássica). The Tasks interface (#804) is offered only where core/version.js BUILD is
  set (the dev/ site, the development single file): web/js/modern.js tasksAvailable, getInterface and applyPrefs
  read a stored 'tasks' as the modern interface elsewhere (the dev/ and stable sites share their storage) and
  setInterface('tasks') does nothing there; web/index.html's early script takes it only with a development build's
  `<html data-dev>` (scripts/build-standalone.mjs), so a release shows no Tasks layout before its first paint either.
  Tests: test/modern.test.js and test/tasks.test.js (a release reads tasks as modern, the early script without
  data-dev), test/ui/tasks.test.js (its tests as a development build; without one, no Tasks item and a stored tasks
  opens the modern interface), test/ui/modern.test.js (Modern and Classic, in English and Portuguese).
