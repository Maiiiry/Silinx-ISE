In short:

- **The Silinx toolchain is a production toolchain:** Toolchain Settings, the start page, the processes and the
  documentation no longer call it experimental ("Silinx toolchain (no ISE)").

In detail:

- **The Silinx toolchain no longer called experimental (#675):** the mode's label "Silinx toolchain (no ISE)"
  (Toolchain Settings, the processes' tooltip, the start page's tip, the server's log and status, the CLI) and its
  Portuguese "Toolchain Silinx (sem ISE)"; the settings' note "Experimental: check the design on the board." left
  out; README.md and docs/QUALITY.md (test/designs-corpus/quality-page.mjs) updated. Tests: test/docs.test.js (no
  doc and no label of the interface calls it experimental), the label's tests in test/cli.test.js,
  test/open-toolchain.test.js, test/ui/app.test.js and test/ui/open-toolchain.test.js.
