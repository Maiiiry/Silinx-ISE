In short:

- **Edit ▸ Undo after a command:** text typed right after a Rename (or another project command), while the
  application still reloads the project behind it, is undone by Edit ▸ Undo before the command.

In detail:

- **Edit ▸ Undo: an edit typed while a project command still runs is the user's (#534):** the text editor tells
  the application whether a change was the user's own (CodeMirror's user-event annotation: typed, pasted,
  undone or redone there, a fix or a snippet) or written by it (a command, an Undo); the application no longer
  guesses from the timing, which left out an edit made while a command's tail still ran and showed the command's
  Undo first (the flaky UI test). The test waits for the edit before reading the menu; a new test types during
  a slow command.
