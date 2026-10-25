In short:

- **Portuguese:** a project or file name with `$&` or `$'` in it shows as written in the translated labels.

In detail:

- **t(): the translation put back as text (#1232):** web/js/i18n.js replaces the label with a function, so `$&`,
  `` $` ``, `$'` and `$$` in the translated text (a captured name) are not taken as replacement patterns.
