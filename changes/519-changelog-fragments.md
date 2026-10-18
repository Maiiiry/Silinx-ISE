In detail:

- **Changelog fragments (#519):** a change no longer edits CHANGELOG.md, whose unreleased section made every
  pull request conflict with the others merged before it: it adds its own file, `changes/<issue>-<slug>.md`,
  with its "In short:" item (optional) and its "In detail:" items (changes/README.md); a unit test checks the
  fragments' names and format. A release assembles them into its section, newest issue first, and deletes them
  (`scripts/changelog-release.mjs <version>`, the first of the release steps; `scripts/sync-version.mjs` refuses a
  version while fragments are left). The development build's notes list the fragments not released yet; the
  release notes and Check for Updates' "What's new" read the tagged CHANGELOG.md, as before.
