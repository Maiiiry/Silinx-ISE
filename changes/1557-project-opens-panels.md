In short:

- **A project opened shows the side panel and the messages:** whatever was left folded or maximized before.

In detail:

- **A project opened shows the side panel and the messages (#1557):** opening a project (the New Project wizard or an
  existing one) gives every task of the modern interface its side panel and messages open and no document maximized,
  kept (`openedState`); they can be folded again as before. Emulate's side panel on a narrow screen goes back to its
  default, folded so the board has its room (#1463). In the classic interface, on a narrow screen, the drawer opens with
  the project (on a wide screen the left pane and the console cannot be hidden).
