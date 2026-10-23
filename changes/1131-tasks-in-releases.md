In short:

- **The Tasks interface in the releases too:** View ▸ Interface offers Modern, Classic and Tasks in every edition, no
  longer only in the development build; Modern stays the default.

In detail:

- **Tasks in every build (#1131):** the development build's gate (#838) removed from web/js/modern.js, the View menu
  and the early script of web/index.html (a stored choice of Tasks is kept, its layout before the first paint); the
  standalone build's `<html data-dev>`, read by that script only, no longer written. The Development menu stays the
  development build's only.
