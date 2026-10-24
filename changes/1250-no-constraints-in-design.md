In short:

- The Design hierarchy no longer lists the constraints file (nor, in the modern interface, a Constraints group): the
  Files page has it, and the top module's User Constraints processes open, check and plan it.

In detail:

- **No constraints in the design hierarchy (#1250):** web/js/design.js (the UCF row under the device, the Tasks
  interface's Constraints group). Tests: test/ui/hierarchy.test.js (the examples' trees; the UCF on the Files page),
  test/ui/tasks.test.js (Edit's tree, the classic one), test/ui/app.test.js (the constraints' processes under the top
  module).
