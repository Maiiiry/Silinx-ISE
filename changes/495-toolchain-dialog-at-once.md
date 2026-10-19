In short:

- **Toolchain Settings** opens at once and says it is detecting the toolchain, instead of appearing seconds later
  over whatever was done meanwhile.

In detail:

- **Tools ▸ Toolchain Settings opens at once (#495):** the dialog waited for the server's detection (which runs
  the device programmers for their versions: seconds on a slow machine) and then came over whatever was done
  meanwhile; on CI it covered the menu bar while the next menu was being opened ("every menu opens…", in Firefox
  and Chrome). It now opens at once with "Detecting the toolchain…", Save disabled, and is filled in when the
  answer comes; closed before it, nothing comes after. The UI test harness names the element over a menu title
  it cannot reach.
