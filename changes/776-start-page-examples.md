In short:

- **Start page:** the seven "Open Example (…)" entries are gone; the examples are in New Project…, under *Start from*
  (Example: gates, traffic, blinky, pong, stopwatch, clock, vga).

In detail:

- **The Start page's Open Example entries removed (#776):** its Project Commands are New Project…, Open Project… and the
  two imports; the examples stay New Project's templates, in their order (web/js/project.js, their Portuguese
  labels out of web/js/i18n.js). docs/GETTING-STARTED.md and docs/COMECAR.md say New Project… ▸ Start from ▸ Example.
  Test: test/ui/projects.test.js (no Open Example entry; the wizard's templates in their order; gates, traffic and
  pong opened through New Project…).
