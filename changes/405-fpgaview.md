In detail:

- The FPGA view's code split (#405): the details of a selected site (its site, tile, module, port and pin, I/O
  standard, the elements inside, a LUT's contents, the connections) in `web/js/fpgaview-details.js`, out of
  `mountFpgaView` (348 → 255 lines); no change in behaviour.
