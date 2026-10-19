In detail:

- **CodeQL's alerts reviewed (#585):** boardConstraints (server/projects.js) joins the project's own paths with
  safeJoin, like the rest of the API (test/server-units.test.js: a constraints path out of the project refused, a
  source out of it skipped); the corpus's cache-path regex can no longer match a text two ways
  (test/designs-corpus.test.js); test/power.test.js compares its sentence as text (a template literal's '\.' was a
  plain '.'). The other alerts are false positives, dismissed with their reason.
