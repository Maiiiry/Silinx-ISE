In short:

- **Schematics at Full View when the room changes:** showing or hiding the side panel or the messages, or maximizing
  or restoring the document, zooms the schematic in front (the editor, a read-only schematic, the RTL / Technology
  viewer) to Full View.

In detail:

- **Full View on a layout toggle (#1203):** web/js/layout-fit.js (new: `layoutToggled()`, the signal; `onLayoutToggled(el,
  fit)`, a shown drawing fitted at once and while its room settles); web/js/tasks.js (the bar's side panel, messages and
  maximize buttons, a tab's double click, Ctrl/Cmd+Shift+Enter and a folded panel's tab send it); web/js/sch-editor.js and
  web/js/schematic-view.js listen while they live. Test: test/ui/sch-layout-fit.test.js.
