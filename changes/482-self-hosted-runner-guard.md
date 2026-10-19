In detail:

- **The self-hosted ISE runner, out of reach of a pull request's code (#482):** the jobs on the runner
  (`ise.yml`, `quality.yml`) check their event as well as their repository and ref: scheduled or by hand,
  on `main` only. `test/workflows.test.js` fails when any workflow could send a pull request's code there:
  a job on `[self-hosted, ise]` in a workflow with another event (`pull_request`, `pull_request_target`,
  `push`, `workflow_call`, `workflow_run`…), without that guard or with a pull request's ref; the runner's
  labels in another form, in a matrix or from an expression; a reusable workflow from another repository.
  The test proves its checker on workflows built to break each rule. `SECURITY.md` says so; the repository
  settings only its administrator can change are a checklist on the issue.
