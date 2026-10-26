In detail:

- **The workflows' dependencies installed without their install scripts, their checkouts without credentials (#1436):**
  the setup action runs `npm ci` with `NPM_CONFIG_IGNORE_SCRIPTS` on every runner (the Pages builds of the older
  tags too), every checkout sets `persist-credentials: false`, and the token reaches only the step that publishes
  (the development build's tag and files, the quality results' branch, the deployment of the site, whose
  `pages` / `id-token` permissions moved from the workflow to its deploy job); Dependabot proposes an npm version
  a week after it is published. `test/workflows-permissions.test.js` checks it.
