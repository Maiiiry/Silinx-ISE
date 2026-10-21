In short:

- **A third interface, Tasks (View ▸ Interface ▸ Tasks), in the development builds for now:** the five tasks of a lab session (Edit, Simulate,
  Emulate, Implement, Program) in the header, each with its own documents and arrangement: the task in front
  gets the space, the side panel and the messages fold away and come back with one click, a document
  maximizes with a double-click on its tab. On a tablet in portrait the tasks are a tab bar at the bottom.
  The modern and classic interfaces are unchanged.

In detail:

- **The Tasks interface and its frame (#804, from #782's direction A):** a third choice in View ▸ Interface,
  with the modern look and its own layout (`<html data-layout="tasks">`, web/js/tasks.js, web/css/tasks.css).
  - The task switcher in the header (a tab bar at the bottom of a screen 1024 px wide or less) shows each
    task's state from its processes (done, warnings, errors, running, out of date).
  - Each task keeps its arrangement per viewer: the side panel open or folded into the activity bar, the
    messages open or folded to their tabs, a maximized document, and its last document. Only its own
    documents' tabs are shown, and a document brought to the front brings its task. Implement opens the
    Design Summary and Program opens iMPACT.
  - A task with no document says what it does and offers its action (the design-flow button of the modern
    toolbar). New errors open the messages.
  - Maximize: double-click a document's tab, press Ctrl/Cmd+Shift+Enter or use the task's bar.
  - Its parts exist only in that interface; labels are in Portuguese, and the header fits from 1025 to
    1440 px in both languages.
