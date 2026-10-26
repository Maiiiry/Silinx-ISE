In detail:

- **The private-data scan looks further (#1441):** `scripts/check-private-data.mjs` also finds IPv6 and MAC
  addresses (but loopback, the documentation prefix, the broadcast address), computer names on their own
  (under `.lan` / `.home.arpa`, or with a hyphen or a digit under `.local` / `.internal`), network paths
  (`\\server\share`, in text), SSH public keys, PGP and PuTTY private keys, an AWS secret key as a value and a
  bearer token written out; a Xilinx bitstream is recognized by its header under any name, a compressed file
  (`.gz`) by what it holds, the other binary files by their readable strings, and a line over 20000 characters is
  scanned in chunks instead of skipped. The rules that need a character (`@`, `:`, `://`) skip a line without
  it: the scan of the repository takes 2.6 s instead of the 34 s the e-mail rule alone took on the device graphs.
  `test/private-data.test.js` has a sample per rule; the repository and its history stay clean.
