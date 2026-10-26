In detail:

- **The Yosys update workflow's writing steps run the base's code; the base's version checked before `npm install`
  (#1440):** `yosys-update.yml`'s `check` and `report` jobs check out the pull request's base (`base.sha`, under
  `base/`) and run its `scripts/yosys-update-report.mjs` for the `versions` and `comment` commands, the two steps
  whose job holds a writing token; the pull request's own scripts run only where the token reads. The `measure`
  job's own step refuses a `BASE_VERSION` that is not a version (digits and dots) before it reaches
  `npm install`. `test/yosys-update.test.js` checks the steps and their order.
