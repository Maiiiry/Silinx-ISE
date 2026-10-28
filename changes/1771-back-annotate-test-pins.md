In detail:

- **The Back-annotate Pin Locations UI test reads the placer's pads from its run (#1771):** test/ui/open-toolchain.test.js
  listed the five pads the placer chose for blinky's unconstrained LEDs and switch. Since the LUT inputs' delays by pin
  (#1359) the placer chooses others, and the test failed on main. It now reads them from the run's build/top_pins.ucf
  (five different pads, none of them one the UCF gives) and checks the dialog, the Portuguese one and the UCF written
  against them, so that a change of the placer no longer breaks it.
