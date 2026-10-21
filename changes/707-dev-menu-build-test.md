In detail:

- **The Development menu tested on real builds (#707):** scripts/build-info.mjs takes GitHub's API from
  GITHUB_API_URL (a workflow's, api.github.com by default). test/build-dev-menu.test.js builds the single file on a
  repository of its own against an API served by the test: a development build carries its changes typed by their
  labels and never the token; the same commit tagged v<VERSION>, a release, carries none and asks the API nothing.
