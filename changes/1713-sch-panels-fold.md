In short:

- **The schematic's side panels fold:** the Symbols and Properties panels collapse into a thin strip by a button in
  their title, and expand again by a click on the strip, for a small window or the split view. Remembered.

In detail:

- **Schematic editor: the Symbols and Properties panels collapse and expand (#1713):** a chevron in each panel's
  title folds it into a 24 px strip with its name down the side; a click on the strip, or the chevron, expands it.
  Each panel's state is remembered per viewer. Under 1024 px the toolbar's ☰ Symbols / ☰ Properties stay as before.
  New module `web/js/sch-panels.js`.
