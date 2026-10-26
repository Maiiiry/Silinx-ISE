In detail:

- **Check for Updates: links only to GitHub's own URLs (#1444):** the release's page and its downloads, from GitHub's
  release object (kept in localStorage for the next sessions), are made into anchors only when their URL is of
  https://github.com, api.github.com or objects.githubusercontent.com (`web/js/release-url.js`); any other URL
  (javascript:, http:, another host) shows the name as text. A unit test on the check, a UI test on the dialog.
