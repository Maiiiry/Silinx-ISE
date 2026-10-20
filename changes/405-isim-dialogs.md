In detail:

- **mountISim split, fourth part: the dialogs in web/js/isim-dialogs.js (#405):** the dialog open over the window
  (one at a time: `show`, `closeDialog`) and Force Constant / Force Clock (`forceDialog`) move from mountISim to
  mountDialogs(ctx), called at the same point of the mount; the drawn stimuli's dialogs open through `show`. No
  change in behaviour. Tests: `test/ui/isim-dialogs.test.js`, the dialogs mounted alone.
