In short:

- **Document tabs:** all the same width, with their close button always shown at the same place, so several can be
  closed in a row without moving the pointer (and on a tablet, which has no hover).

In detail:

- **The document tabs' width and close buttons (#1128):** web/css/app.css gives #doc-tabs' tabs one width (170 px,
  190 in the modern interface), the name cut with an ellipsis, the close button at the right end; modern.css no longer
  hides an inactive tab's close button until hovered.
