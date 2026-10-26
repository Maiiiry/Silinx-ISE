In detail:

- **The workflows' tests check `*.yaml` files too (#1438):** `test/workflows.test.js`, `test/workflows-permissions.test.js`
  and `test/ise-runner.test.js` list the workflows with one shared filter (`test/workflows-lib.mjs`, `.yml` and
  `.yaml`, as GitHub runs both), so a `*.yaml` workflow can no longer escape the self-hosted runner's guard, the
  pinning of the actions, the permissions and the other rules; a test checks the filter.
