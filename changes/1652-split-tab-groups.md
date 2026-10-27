In short:

- **Two documents side by side, each side with its tabs:** the *Split* button at the header's right end splits the
  editor; each side has its own tabs, a document opened goes to the side worked in, and a tab is dragged to the other
  side. *Show Generated HDL Beside* (a tab's right-click menu, the View menu) shows a drawing's or a C source's HDL on
  the other side, following the drawing as it is edited.

In detail:

- **Split editor with two tab groups (#1652):** web/js/split-view.js, replacing #1619's pair of documents. Each side
  has its own tabs (in the tab bar over it) and its own document in front; a document opened goes to the side worked
  in (the one of the document in front, or the empty side clicked). The Split button (the Tasks interface: before the
  side panel's button; the modern one: the header's right end; the classic one: the toolbar's right end) and View ▸
  Split Editor toggle the split; the right side starts empty, with the other open documents one click away. A tab
  dragged to the other side's tabs or pane, or its menu's *Move to the Other Side*, moves it there; *Open to the Side*
  is gone. A side whose last document closes, or *Close Split*, leaves one. The right side's documents are kept with
  the project (#1619's kept pair is read too); a workspace under 720 px stacks the sides, each with its tabs over it;
  the Tasks interface follows its task on each side. Tests: test/ui/split-view.test.js (both interfaces, Tasks,
  Portuguese).
