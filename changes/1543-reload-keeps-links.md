In short:

- **Drawings stay linked while the project reloads:** a reload no longer leaves the drawings unlinked from their HDL
  for a moment while it reads them.

In detail:

- **The drawings' links set once a reload has read them (#1543):** reloading a project built its maps of drawings and
  their HDL files from empty while it read the drawings, so whatever looked at them meanwhile saw no drawing linked; the
  maps are made first and set together.
