In short:

- Add Copy of Source's Files input no longer runs past the dialog's right edge.

In detail:

- **A form's fields within their column (#1326):** web/css/app.css (.form-grid: its fields min-width 0, a file input as
  wide as its column). Test: test/ui/new-source.test.js (four window widths).
