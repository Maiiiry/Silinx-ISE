In detail:

- **Tests: the C editor's checks test follows the local pointers' message (#1723):** `test/ui/c-check.test.js`
  (#1524) expected the pointer error from before #1599. It now expects the local pointer's whole message,
  "the pointer 'p': set to something other than an array, &x, &a[i] or a + i: not supported yet", with its
  help (c-pointer-variable).
