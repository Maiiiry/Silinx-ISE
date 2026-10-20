In short:

- **A Development menu in the development builds:** after Help, the changes since the last release, as Features,
  Bug fixes and Other: each one opens with its text and its issue on GitHub; "All Changes since …" lists them all.

In detail:

- **The Development menu (#707):** a development build (the site's dev/ and the development single file) carries its
  changes since the last release, the changes/*.md fragments typed by their issues' labels (bug, enhancement) from
  GitHub's API at build time (scripts/build-info.mjs devChanges, only with the publishing workflows' token, issues:
  read in pages.yml and dev-release.yml; core/changelog.js buildChanges), in core/version.js BUILD. web/js/devmenu.js
  shows them after Help, their text written as text (bold and code as elements); a release and the local server show
  no menu. Tests: test/changelog.test.js, test/build-info.test.js (the labels, the token only in the requests, no
  request without one), test/ci-workflow.test.js (the permissions, the token in the build step only),
  test/ui/dev-menu.test.js (the menu in both interfaces and in Portuguese, a change's window, the text not as HTML,
  no menu without a development build).
