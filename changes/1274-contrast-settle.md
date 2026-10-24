In detail:

- **The contrast tests measure settled colours (#1274):** test/ui/dark-contrast.test.js waits for the colour
  transitions (.12 s, web/css/modern.css) to end before measuring, so that a button just enabled is not read halfway.
