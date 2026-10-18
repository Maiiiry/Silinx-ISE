# Changelog fragments

What changed since the last release, one file per change. A pull request never edits
[CHANGELOG.md](../CHANGELOG.md): it adds its own fragment here, so pull requests merged one after the other
no longer conflict in the changelog. A release assembles the fragments into its section of CHANGELOG.md
and deletes them.

## Writing a fragment

One new file per change, named `<issue>-<slug>.md`: the issue's number, then a few lower-case words joined
by hyphens (`490-generate-and-simulate.md`). It holds the change's items of a CHANGELOG.md section, under
the same two headings:

```markdown
In short:

- **Generate and Simulate:** Simulate (or Emulate) a Post-Synthesis Model that is not generated yet offers to
  generate it and goes on with the simulation once it is.

In detail:

- **A simulation model not generated yet: "Generate and Simulate" (#490):** the process's run asks whether to
  generate the model, runs its process, then the simulation; a model that needs Xilinx ISE says so.
```

- **"In short:"** (optional) is for what users notice, in their words. Leave it out for a change they do
  not see (CI, tests, refactoring): the fragment then has only "In detail:".
- **"In detail:"** (required) has one item or more for the change, and names its issue (`#490`).
- Each item is a `- ` line, continued on lines indented by two spaces; no blank line inside a list, no
  other text.
- A follow-up of the same issue in another pull request adds another fragment (`490-generate-and-emulate.md`):
  two fragments never have the same slug.

`test/changelog-fragments.test.js` checks every fragment (the name, the format, the issue number).

## At a release

`node scripts/changelog-release.mjs <version>` puts the fragments' items into a new `## <version>` section at
the top of CHANGELOG.md (or into that version's section when one was written by hand), the newest issue
first (the highest number; the same issue's fragments by name), and deletes the fragments. `--dry-run`
prints the section without changing anything. The releaser may then edit the section before the version's
commit: an introduction above "In short:", a shorter or regrouped "In short:" list. See the release steps in
[CLAUDE.md](../CLAUDE.md).

Until then, the development build's notes ("Not released yet") list the fragments.
