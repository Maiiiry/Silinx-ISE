In detail:

- **The browser edition's Back-annotate Pin Locations UI test takes the placer's pads from its run (#1840):** as
  #1771 did for the local server's, test/ui/standalone.test.js listed the five pads the placer chose for blinky's
  unconstrained LEDs and switch, and failed on main since the placer chooses others (#1359). It now reads them from
  the dialog (five different pads, none of them one the UCF gives) and checks the UCF written against them.
