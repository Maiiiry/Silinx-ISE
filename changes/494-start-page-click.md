In short:

- **The Start page:** a click on a recent project is no longer lost when the page is drawn again at that moment
  (just after a project was closed).

In detail:

- **The Start page kept when it has not changed (#494):** the Start page, drawn again when it is shown (each Close
  Project), was rebuilt by every drawing, and a drawing finishing between the press on a recent project and its
  release lost the click (the UI test of #375 failed so on CI); a drawing now keeps the page when nothing changed,
  and the last drawing started is the one shown (an earlier one finishing later no longer shows the list as it
  was). The UI test presses a recent project, draws the page again, then releases.
